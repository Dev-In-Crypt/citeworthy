import { PLAN_LIMITS, type PlanLimits } from "./period";

/**
 * Что агентству разрешено прямо сейчас.
 *
 * Считается из подписки, а не из полей агентства: поля — производные, их
 * обновляет вебхук, и рассинхрон между «что записано» и «за что заплачено»
 * должен разрешаться в пользу подписки.
 *
 * Чистая функция без обращений к провайдеру: решение о доступе принимается
 * даже когда провайдер недоступен.
 */

export type PlanId = keyof typeof PLAN_LIMITS;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface SubscriptionSnapshot {
  plan: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface Entitlements extends PlanLimits {
  plan: PlanId;
  /** Работает ли продукт: измерения, отчёты, новые клиенты. */
  active: boolean;
  /** Почему так — строка для интерфейса, не код ошибки. */
  reason: string;
}

/**
 * План без подписки.
 *
 * Агентство, которое только зарегистрировалось, работает на starter: продукт
 * бесполезно оценивать, не заведя клиента, а требовать карту до первого
 * измерения — верный способ не получить ни одного агентства.
 */
export const DEFAULT_PLAN: PlanId = "starter";

/**
 * Сколько дней после сбоя платежа агентство продолжает работать.
 *
 * Отключать в день неудачного списания нельзя: у карты кончился срок,
 * банк отклонил разовый платёж — это не отказ от продукта. Клиентские
 * отчёты в это время должны продолжать открываться.
 */
export const PAST_DUE_GRACE_DAYS = 14;

export function entitlementsFor(
  subscription: SubscriptionSnapshot | null,
  now: Date = new Date(),
): Entitlements {
  if (!subscription) {
    return {
      plan: DEFAULT_PLAN,
      ...PLAN_LIMITS[DEFAULT_PLAN],
      active: true,
      reason: "No subscription yet — the starter limits apply.",
    };
  }

  const limits = PLAN_LIMITS[subscription.plan];

  switch (subscription.status) {
    case "active":
    case "trialing":
      return {
        plan: subscription.plan,
        ...limits,
        active: true,
        reason: subscription.cancelAtPeriodEnd
          ? "Subscription ends at the close of the current period."
          : "Subscription is active.",
      };

    case "past_due": {
      const deadline = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000)
        : null;
      const withinGrace = deadline === null || now.getTime() <= deadline.getTime();

      return {
        plan: subscription.plan,
        ...limits,
        active: withinGrace,
        reason: withinGrace
          ? "A payment did not go through. Update the card to keep the account running."
          : "The account is suspended after an unpaid period.",
      };
    }

    case "canceled":
    case "incomplete":
      return {
        plan: DEFAULT_PLAN,
        ...PLAN_LIMITS[DEFAULT_PLAN],
        active: false,
        reason:
          subscription.status === "canceled"
            ? "The subscription was cancelled."
            : "Checkout was never completed.",
      };
  }
}

export interface LimitDecision {
  allowed: boolean;
  /** Текст для интерфейса: человек должен понять, что делать дальше. */
  message: string;
}

/** Можно ли завести ещё одного клиента на текущем плане. */
export function canAddClient(entitlements: Entitlements, currentClients: number): LimitDecision {
  if (!entitlements.active) {
    return { allowed: false, message: entitlements.reason };
  }

  if (currentClients >= entitlements.clientLimit) {
    return {
      allowed: false,
      message: `The ${entitlements.plan} plan covers ${entitlements.clientLimit} clients. Upgrade to add more.`,
    };
  }

  return { allowed: true, message: "" };
}
