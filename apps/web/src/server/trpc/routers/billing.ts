import { z } from "zod";
import { billingPeriod, PLAN_LIMITS, usageStatus } from "@repo/core";
import {
  countClientsByAgency,
  getAgencyById,
  getUsageCounter,
} from "@repo/db";
import { protectedProcedure, router } from "../trpc";

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
});
