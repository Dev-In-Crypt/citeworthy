import { billingPeriod, canStartMeasurement, entitlementsFor, type Entitlements, type LimitDecision } from "@repo/core";
import { getSubscriptionByAgency, getUsageCounter, type Database } from "@repo/db";

/**
 * Права агентства по его подписке.
 *
 * Лежит здесь, а не в приложении, потому что спрашивают об этом оба:
 * веб — когда человек нажимает «измерить», воркер — когда то же измерение
 * начинает расписание. Два вычисления одного права разъехались бы молча, и
 * цена расхождения — наши деньги, потраченные на того, кто перестал платить.
 *
 * Отсутствие подписки — не ошибка: у только что заведённого агентства её нет,
 * и права считаются от умолчания (`entitlementsFor(null)`).
 */
export async function entitlementsForAgency(
  db: Database,
  agencyId: string,
  now: Date = new Date(),
): Promise<Entitlements> {
  const subscription = await getSubscriptionByAgency(db, agencyId);

  return entitlementsFor(
    subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    now,
  );
}

/**
 * Можно ли начать измерение агентству: и права, и остаток бесплатных проверок.
 *
 * Тем же правилом, что и в вебе. Иначе расписание обходило бы границу,
 * закрытую для кнопки: бесплатный аккаунт продолжал бы опрашивать
 * ассистентов раз в две недели за наш счёт.
 */
export async function measurementAllowedForAgency(
  db: Database,
  agencyId: string,
  now: Date = new Date(),
): Promise<LimitDecision> {
  const entitlements = await entitlementsForAgency(db, agencyId, now);
  const counter = await getUsageCounter(db, agencyId, billingPeriod(now));

  return canStartMeasurement(entitlements, counter?.aiChecksUsed ?? 0);
}
