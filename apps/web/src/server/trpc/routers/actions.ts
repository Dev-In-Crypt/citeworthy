import { z } from "zod";
import { ACTION_TYPES, recommendationSchema } from "@repo/core";
import {
  createAction,
  deleteAction,
  findExistingAction,
  getActionById,
  getClientById,
  getSourceByDomain,
  listActions,
  listActivity,
  logActivity,
  updateAction,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";

const IMPACT = ["low", "medium", "high"] as const;
const STATUS = ["backlog", "in_progress", "done", "dropped"] as const;

export const actionsRouter = router({
  activity: protectedProcedure
    .input(z.object({ clientId: z.uuid(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);
      return listActivity(ctx.db, input.clientId, input.limit);
    }),

  list: protectedProcedure
    .input(z.object({ clientId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);
      return listActions(ctx.db, input.clientId);
    }),

  create: roleProcedure("member")
    .input(
      z.object({
        clientId: z.uuid(),
        title: z.string().min(1).max(300),
        // Непустой reason обязателен и здесь, а не только в генераторе:
        // действие без объяснения нельзя защитить перед клиентом (принцип 6).
        reason: z.string().min(1).max(2000),
        actionType: z.enum(ACTION_TYPES),
        estimatedImpact: z.enum(IMPACT).default("medium"),
        effort: z.enum(IMPACT).default("medium"),
        affectedClusterIds: z.array(z.uuid()).default([]),
        sourceDomain: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const { clientId, sourceDomain, ...rest } = input;
      const source = sourceDomain ? await getSourceByDomain(ctx.db, sourceDomain) : undefined;

      const action = await createAction(ctx.db, {
        clientId,
        ...rest,
        sourceDomain: sourceDomain ?? null,
        sourceId: source?.id ?? null,
        // Владелец назначается явно, а не автоматически: тот, кто завёл действие,
        // не обязательно тот, кто будет его выполнять.
      });

      await logActivity(ctx.db, {
        agencyId: ctx.user.agencyId,
        clientId,
        actorUserId: null,
        eventType: "action_created",
        payload: { actionId: action.id, title: action.title, actionType: action.actionType },
      });

      return action;
    }),

  /**
   * Превращает рекомендацию в действие одним вызовом.
   * Рекомендация валидируется той же схемой, что и на генерации: клиент мог
   * прислать что угодно, а требование непустого reason — инвариант, а не UI-подсказка.
   */
  convertFromRecommendation: roleProcedure("member")
    .input(z.object({ clientId: z.uuid(), recommendation: recommendationSchema }))
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const { recommendation } = input;

      // Повторный клик по той же рекомендации не должен плодить дубли:
      // очередь действий — рабочий инструмент, а не журнал нажатий.
      const existing = await findExistingAction(
        ctx.db,
        input.clientId,
        recommendation.rule,
        recommendation.sourceDomain ?? null,
      );
      if (existing) {
        return { action: existing, created: false };
      }

      const source = recommendation.sourceDomain
        ? await getSourceByDomain(ctx.db, recommendation.sourceDomain)
        : undefined;

      const action = await createAction(ctx.db, {
        clientId: input.clientId,
        title: recommendation.title,
        reason: recommendation.reason,
        actionType: recommendation.actionType,
        estimatedImpact: recommendation.estimatedImpact,
        effort: recommendation.effort,
        affectedClusterIds: recommendation.clusterId ? [recommendation.clusterId] : [],
        sourceDomain: recommendation.sourceDomain ?? null,
        sourceId: source?.id ?? null,
        originRule: recommendation.rule,
      });

      await logActivity(ctx.db, {
        agencyId: ctx.user.agencyId,
        clientId: input.clientId,
        actorUserId: null,
        eventType: "action_created",
        payload: {
          actionId: action.id,
          title: action.title,
          actionType: action.actionType,
          fromRule: recommendation.rule,
        },
      });

      return { action, created: true };
    }),

  update: roleProcedure("member")
    .input(
      z.object({
        id: z.uuid(),
        title: z.string().min(1).max(300).optional(),
        reason: z.string().min(1).max(2000).optional(),
        status: z.enum(STATUS).optional(),
        estimatedImpact: z.enum(IMPACT).optional(),
        effort: z.enum(IMPACT).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const action = await getActionById(ctx.db, input.id);
      if (!action) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }
      const client = await getClientById(ctx.db, action.clientId);
      assertTenant(client, ctx.user.agencyId);

      const { id, status, ...patch } = input;

      // Дата завершения ставится вместе со статусом: без неё эксперимент
      // не сможет отделить «до» от «после».
      const completedAt =
        status === "done" ? (action.completedAt ?? new Date()) : status ? null : undefined;

      const updated = await updateAction(ctx.db, id, {
        ...patch,
        ...(status ? { status } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
      });

      if (status && status !== action.status) {
        await logActivity(ctx.db, {
          agencyId: ctx.user.agencyId,
          clientId: action.clientId,
          actorUserId: null,
          // Завершение — отдельное событие: именно оно попадёт в отчёт клиенту
          // и станет точкой отсчёта для эксперимента.
          eventType: status === "done" ? "action_completed" : "action_status_changed",
          payload: { actionId: action.id, title: action.title, from: action.status, to: status },
        });
      }

      return updated;
    }),

  delete: roleProcedure("member")
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const action = await getActionById(ctx.db, input.id);
      if (!action) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }
      const client = await getClientById(ctx.db, action.clientId);
      assertTenant(client, ctx.user.agencyId);

      await deleteAction(ctx.db, input.id);
      return { id: input.id };
    }),
});
