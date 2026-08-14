import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { canAddClient, competitorGapPp, confidenceFor, normalizeDomain } from "@repo/core";
import {
  countClientsByAgency,
  createClient,
  deleteClient,
  getClientById,
  listClientsByAgency,
  listPortfolioRows,
  updateClient,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";
import { entitlementsForAgency } from "../../subscription";

const clientInput = z.object({
  name: z.string().min(1).max(200),
  /**
   * Домен приводится к голому хосту прямо на входе: агентство вставляет его
   * копипастом из адресной строки, а сравнивается он с доменами из цитат.
   * «https://acme.com/» не совпало бы ни с чем, и страницы клиента перестали
   * бы опознаваться как его собственные — диагностика молча соврала бы.
   */
  domain: z
    .string()
    .min(1)
    .max(255)
    .transform(normalizeDomain)
    .refine((value) => value.includes("."), "Enter a domain, for example acme.com"),
  industry: z.string().max(200).optional(),
  brandNames: z.array(z.string().min(1)).default([]),
  competitorNames: z.array(z.string().min(1)).default([]),
  /**
   * `prospect` — клиент для бесплатного аудита: ещё не платит, но измеряется
   * тем же пайплайном. Отдельного флага нет — статус и так перечисление.
   */
  status: z.enum(["active", "paused", "prospect"]).optional(),
});

export const clientsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listClientsByAgency(ctx.db, ctx.user.agencyId)),

  /**
   * Портфель агентства — первый экран продукта.
   *
   * Отдаёт не только цифры, но и то, что требует человека: отчёт на
   * согласовании, зависшие действия, сломанное расписание. Экран, который
   * показывает только проценты, не отвечает на вопрос «чем мне заняться».
   */
  portfolio: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listPortfolioRows(ctx.db, ctx.user.agencyId);

    return rows.map((row) => {
      const gapPp =
        row.visibilityPct === null
          ? null
          : competitorGapPp({
              clusterId: null,
              platform: null,
              periodStart: new Date(0),
              periodEnd: new Date(0),
              clientVisibilityPct: row.visibilityPct,
              competitorVisibility: row.competitorVisibility,
              sampleCount: row.sampleCount,
              sufficient: row.sufficient,
            });

      const needs: string[] = [];
      if (row.reportsAwaitingApproval > 0) {
        needs.push(
          row.reportsAwaitingApproval === 1
            ? "Report to approve"
            : `${row.reportsAwaitingApproval} reports to approve`,
        );
      }
      if (row.staleActions > 0) {
        needs.push(`${row.staleActions} actions stalled`);
      }
      if (row.lastRunAt === null) {
        needs.push("Awaiting first run");
      }

      return {
        clientId: row.clientId,
        name: row.name,
        domain: row.domain,
        status: row.status,
        visibilityPct: row.visibilityPct,
        gapPp,
        deltaPp: row.deltaPp,
        sampleCount: row.sampleCount,
        sufficient: row.sufficient,
        confidence: confidenceFor(row.sampleCount),
        openActions: row.openActions,
        lastRunAt: row.lastRunAt,
        needs,
      };
    });
  }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const client = await getClientById(ctx.db, input.id);
    assertTenant(client, ctx.user.agencyId);
    return client;
  }),

  create: roleProcedure("admin")
    .input(clientInput)
    .mutation(async ({ ctx, input }) => {
      const [entitlements, used] = await Promise.all([
        entitlementsForAgency(ctx.db, ctx.user.agencyId),
        countClientsByAgency(ctx.db, ctx.user.agencyId),
      ]);

      /**
       * Лимит тарифа — billing unit продукта это активный клиентский аккаунт.
       * Считается от подписки, а не от полей агентства: они производные, и
       * рассинхрон должен разрешаться в пользу того, за что заплачено.
       */
      const decision = canAddClient(entitlements, used);
      if (!decision.allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: decision.message });
      }

      return createClient(ctx.db, { ...input, agencyId: ctx.user.agencyId });
    }),

  update: roleProcedure("admin")
    .input(clientInput.partial().extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getClientById(ctx.db, input.id);
      assertTenant(existing, ctx.user.agencyId);

      const { id, ...patch } = input;
      return updateClient(ctx.db, id, patch);
    }),

  delete: roleProcedure("admin")
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getClientById(ctx.db, input.id);
      assertTenant(existing, ctx.user.agencyId);

      await deleteClient(ctx.db, input.id);
      return { id: input.id };
    }),
});
