import { z } from "zod";
import {
  billingPeriod,
  billingPeriodBounds,
  PLAN_LIMITS,
  sumCostUsd,
  usageStatus,
} from "@repo/core";
import {
  countClientsByAgency,
  countFixtureAnswers,
  getAgencyById,
  getUsageCounter,
  listCostsByClientAndPlatform,
} from "@repo/db";
import { protectedProcedure, roleProcedure, router } from "../trpc";

export const billingRouter = router({
  usage: protectedProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const period = input?.period ?? billingPeriod();

      const [agency, counter, clientsUsed] = await Promise.all([
        getAgencyById(ctx.db, ctx.user.agencyId),
        getUsageCounter(ctx.db, ctx.user.agencyId, period),
        countClientsByAgency(ctx.db, ctx.user.agencyId),
      ]);

      const plan = agency?.plan ?? "starter";
      const limits = PLAN_LIMITS[plan];
      const checks = usageStatus(counter?.aiChecksUsed ?? 0, limits.aiCheckAllowance);

      return {
        period,
        plan,
        aiChecks: checks,
        clients: {
          used: clientsUsed,
          limit: agency?.clientLimit ?? limits.clientLimit,
        },
      };
    }),

  /**
   * Стоимость измерений за период — внутренняя страница агентства.
   *
   * Роль не ниже admin: это финансовые данные всего агентства, а member
   * ведёт своих клиентов. Клиенту агентства эти цифры не показываются нигде.
   */
  costs: roleProcedure("admin")
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const period = input?.period ?? billingPeriod();
      const { start, end } = billingPeriodBounds(period);

      const [rows, fixtureAnswers] = await Promise.all([
        listCostsByClientAndPlatform(ctx.db, ctx.user.agencyId, start, end),
        countFixtureAnswers(ctx.db, ctx.user.agencyId, start, end),
      ]);

      const byClient = new Map<string, { clientId: string; clientName: string; costs: string[]; responses: number }>();
      for (const row of rows) {
        const entry = byClient.get(row.clientId) ?? {
          clientId: row.clientId,
          clientName: row.clientName,
          costs: [],
          responses: 0,
        };
        entry.costs.push(row.costUsd);
        entry.responses += row.responses;
        byClient.set(row.clientId, entry);
      }

      return {
        period,
        periodStart: start,
        periodEnd: end,
        rows,
        clients: [...byClient.values()].map((entry) => ({
          clientId: entry.clientId,
          clientName: entry.clientName,
          responses: entry.responses,
          costUsd: sumCostUsd(entry.costs),
        })),
        totalCostUsd: sumCostUsd(rows.map((row) => row.costUsd)),
        totalResponses: rows.reduce((total, row) => total + row.responses, 0),
        /** Ответы на фикстурах: в счёт не входят, но о них надо сказать. */
        fixtureAnswers,
      };
    }),
});
