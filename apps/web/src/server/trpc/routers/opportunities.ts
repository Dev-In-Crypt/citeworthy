import { z } from "zod";
import {
  buildNinetyDayPlan,
  expectedSignalFor,
  OPPORTUNITY_COPY,
  recommendationSchema,
} from "@repo/core";
import { generateOpportunities } from "@repo/pipeline";
import {
  getClientById,
  getClientForOpportunity,
  getOpportunityById,
  lastOpportunityGenerationAt,
  listActionsForOpportunity,
  listOpportunities,
  listOpportunityEvidence,
  logActivity,
  setOpportunityDecision,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";
import { clientOpportunities, toOpportunityView } from "../../opportunities";
import { convertRecommendationToAction } from "../../convert-recommendation";

/**
 * Возможности: список, доказательство и решения по ним.
 *
 * Список читает готовые строки — их считает конвейер после каждого прогона.
 * Пересчёт по кнопке есть, но он именно кнопка: считать диагностику на каждый
 * заход экрана значило бы платить полным проходом по цитированиям за каждое
 * открытие вкладки.
 */

/** Чаще раза в минуту пересчитывать нечего: данные меняются прогонами. */
const REFRESH_FLOOR_MS = 60_000;

export const opportunitiesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        clientId: z.uuid(),
        includeResolved: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      return clientOpportunities(ctx.db, input.clientId, {
        includeResolved: input.includeResolved,
      });
    }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const client = await getClientForOpportunity(ctx.db, input.id);
    assertTenant(client, ctx.user.agencyId);

    const row = await getOpportunityById(ctx.db, input.id);
    if (!row) {
      assertTenant(null, ctx.user.agencyId);
      throw new Error("unreachable");
    }

    const actions = await listActionsForOpportunity(ctx.db, input.id);

    return {
      ...toOpportunityView(row),
      scoreBreakdown: row.scoreBreakdown,
      evidence: row.evidence,
      recommendedActions: row.recommendedActions,
      affectedPromptIds: row.affectedPromptIds,
      affectedClusterIds: row.affectedClusterIds,
      actions: actions.map((action) => ({
        id: action.id,
        title: action.title,
        status: action.status,
      })),
      scoreBasis: OPPORTUNITY_COPY.scoreBasis,
      windowBasis: OPPORTUNITY_COPY.windowBasis,
    };
  }),

  /**
   * «Почему я это вижу»: те самые ответы, по которым посчитана возможность.
   * Сначала агрегат, отдельные ответы — примерами и с оговоркой: один ответ
   * никогда не результат сам по себе.
   */
  evidence: protectedProcedure
    .input(z.object({ id: z.uuid(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const client = await getClientForOpportunity(ctx.db, input.id);
      assertTenant(client, ctx.user.agencyId);

      const row = await getOpportunityById(ctx.db, input.id);
      if (!row) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }

      const evidence = await listOpportunityEvidence(ctx.db, row, input.limit);

      return {
        ...evidence,
        window: { start: row.windowStart, end: row.windowEnd },
        sampleCount: row.sampleCount,
        evidenceLevel: row.evidenceLevel,
        basis: OPPORTUNITY_COPY.evidenceBasis,
      };
    }),

  /**
   * Решение человека. Отклонение требует причины — как и снятие действия:
   * пункт, исчезнувший без объяснения, вернётся тем же детектором, и никто
   * не вспомнит, почему его сняли.
   */
  decide: roleProcedure("member")
    .input(
      z.object({
        id: z.uuid(),
        status: z.enum(["open", "snoozed", "dismissed", "converted"]),
        dismissedReason: z.string().min(1).max(500).optional(),
        snoozedUntil: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getClientForOpportunity(ctx.db, input.id);
      assertTenant(client, ctx.user.agencyId);

      const row = await getOpportunityById(ctx.db, input.id);
      if (!row) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }

      if (input.status === "dismissed" && !input.dismissedReason) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: OPPORTUNITY_COPY.dismissRequiresReason,
        });
      }

      const updated = await setOpportunityDecision(ctx.db, input.id, {
        status: input.status,
        dismissedReason: input.dismissedReason ?? null,
        snoozedUntil: input.snoozedUntil ?? null,
        decidedByUserId: ctx.user.id,
        // Оценка на момент решения: отклонение — суждение о фактах тогда.
        decisionScore: input.status === "open" ? null : row.score,
      });

      if (input.status === "dismissed") {
        await logActivity(ctx.db, {
          agencyId: ctx.user.agencyId,
          clientId: row.clientId,
          actorUserId: ctx.user.id,
          eventType: "opportunity_dismissed",
          payload: { opportunityId: row.id, title: row.title, score: row.score },
        });
      }

      return updated ? toOpportunityView(updated) : null;
    }),

  /** Перенос возможности в работу вместе со всем её контекстом. */
  convertToAction: roleProcedure("member")
    .input(z.object({ id: z.uuid(), recommendation: recommendationSchema }))
    .mutation(async ({ ctx, input }) => {
      const client = await getClientForOpportunity(ctx.db, input.id);
      assertTenant(client, ctx.user.agencyId);

      const row = await getOpportunityById(ctx.db, input.id);
      if (!row) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }

      const result = await convertRecommendationToAction(ctx.db, {
        clientId: row.clientId,
        agencyId: ctx.user.agencyId,
        recommendation: input.recommendation,
        originOpportunityId: row.id,
        // Затронутые темы едут вместе с работой: они же задают treatment-группу
        // эксперимента, и потеряв их здесь, мы измеряли бы потом не то, что делали.
        extraClusterIds: row.affectedClusterIds,
      });

      if (result.created) {
        await setOpportunityDecision(ctx.db, row.id, {
          status: "converted",
          decidedByUserId: ctx.user.id,
          decisionScore: row.score,
        });

        await logActivity(ctx.db, {
          agencyId: ctx.user.agencyId,
          clientId: row.clientId,
          actorUserId: ctx.user.id,
          eventType: "opportunity_converted",
          payload: { opportunityId: row.id, actionId: result.action.id, title: row.title },
        });
      }

      return result;
    }),

  /**
   * План на 90 дней. Собирается из уже найденных возможностей, а не пишется
   * заново: каждая задача тянет за собой причину, объём и уровень
   * доказательности — то, чем он и отличается от универсального плана.
   */
  plan: protectedProcedure
    .input(z.object({ clientId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const rows = (await listOpportunities(ctx.db, input.clientId)).filter(
        (row) => row.status === "open" || row.status === "converted",
      );

      const inputs = rows.flatMap((row) => {
        const parsed = recommendationSchema.safeParse(row.recommendedActions[0]);
        if (!parsed.success) return [];

        return [
          {
            title: parsed.data.title,
            reason: row.reason,
            actionType: parsed.data.actionType,
            affectedPrompts: row.affectedPromptIds.length,
            evidence: row.evidenceLevel,
            expectedSignal: expectedSignalFor(parsed.data.actionType),
          },
        ];
      });

      return buildNinetyDayPlan(inputs);
    }),

  refresh: roleProcedure("member")
    .input(z.object({ clientId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const last = await lastOpportunityGenerationAt(ctx.db, input.clientId);
      if (last && Date.now() - last.getTime() < REFRESH_FLOOR_MS) {
        // Данные меняются прогонами, а не нажатиями. Повторный пересчёт через
        // секунду вернул бы ровно то же самое, только за деньги на базу.
        return { throttled: true as const, detected: 0, resolved: 0, skipped: null };
      }

      const outcome = await generateOpportunities(ctx.db, input.clientId);

      await logActivity(ctx.db, {
        agencyId: ctx.user.agencyId,
        clientId: input.clientId,
        actorUserId: ctx.user.id,
        eventType: "opportunities_refreshed",
        payload: { detected: outcome.detected, resolved: outcome.resolved },
      });

      return { ...outcome, throttled: false as const };
    }),
});
