import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  billingPeriod,
  billingPeriodBounds,
  PLAN_LIMITS,
  sumCostUsd,
  usageStatus,
  type PlanId,
} from "@repo/core";
import {
  countClientsByAgency,
  countFixtureAnswers,
  getAgencyById,
  getSubscriptionByAgency,
  getUsageCounter,
  listCostsByClientAndPlatform,
} from "@repo/db";
import { protectedProcedure, roleProcedure, router } from "../trpc";
import { appUrl } from "../../email";
import { getPaymentProvider } from "../../payments";
import { entitlementsForAgency } from "../../subscription";

export const billingRouter = router({
  /**
   * Что агентство получает сейчас и что может выбрать.
   *
   * `paymentsConfigured` отдаётся честно: без ключей продукт не показывает
   * кнопку оплаты, которая упадёт, — он говорит, что оплата не подключена.
   */
  subscription: protectedProcedure.query(async ({ ctx }) => {
    const [entitlements, subscription, clientsUsed] = await Promise.all([
      entitlementsForAgency(ctx.db, ctx.user.agencyId),
      getSubscriptionByAgency(ctx.db, ctx.user.agencyId),
      countClientsByAgency(ctx.db, ctx.user.agencyId),
    ]);

    return {
      entitlements,
      clientsUsed,
      paymentsConfigured: getPaymentProvider().configured,
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      hasCustomer: Boolean(subscription?.customerId),
      plans: (Object.keys(PLAN_LIMITS) as PlanId[]).map((id) => ({ id, ...PLAN_LIMITS[id] })),
    };
  }),

  /** Ссылка на оплату. Деньги принимает провайдер, продукт их не видит. */
  checkout: roleProcedure("owner")
    .input(z.object({ plan: z.enum(["starter", "growth", "scale"]) }))
    .mutation(async ({ ctx, input }) => {
      const payments = getPaymentProvider();
      if (!payments.configured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payments are not connected yet.",
        });
      }

      const subscription = await getSubscriptionByAgency(ctx.db, ctx.user.agencyId);
      const base = `${appUrl()}/settings/billing`;

      const session = await payments.createCheckout({
        agencyId: ctx.user.agencyId,
        plan: input.plan,
        email: ctx.user.email,
        successUrl: `${base}?checkout=done`,
        cancelUrl: base,
        ...(subscription?.customerId ? { customerId: subscription.customerId } : {}),
      });

      return { url: session.url };
    }),

  /** Карта, счета и отмена — на стороне провайдера: продукт не хранит платёжные данные. */
  portal: roleProcedure("owner").mutation(async ({ ctx }) => {
    const payments = getPaymentProvider();
    const subscription = await getSubscriptionByAgency(ctx.db, ctx.user.agencyId);

    if (!payments.configured || !subscription?.customerId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "There is no billing account to manage yet.",
      });
    }

    const session = await payments.createPortal({
      customerId: subscription.customerId,
      returnUrl: `${appUrl()}/settings/billing`,
    });

    return { url: session.url };
  }),

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
