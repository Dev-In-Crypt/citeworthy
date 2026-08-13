import {
  entitlementsFor,
  type Entitlements,
  type PlanId,
  type SubscriptionChange,
  type SubscriptionStatus,
} from "@repo/core";
import {
  applyPlanToAgency,
  getSubscriptionByAgency,
  getSubscriptionByCustomer,
  upsertSubscription,
  type Database,
} from "@repo/db";

/**
 * Права агентства — единственная точка, через которую их читает приложение.
 *
 * Отдельный модуль, а не метод роутера: те же права нужны и в вебхуке, и в
 * проверке лимита при заведении клиента, и они обязаны считаться одинаково.
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

export type WebhookOutcome =
  | { applied: true; agencyId: string; plan: PlanId; status: SubscriptionStatus }
  | { applied: false; reason: string };

/**
 * Применяет событие провайдера к подписке агентства.
 *
 * Чистая логика решений отделена от HTTP: вебхук — это единственное место,
 * где внешний запрос меняет права, и проверять его надо тестами напрямую.
 *
 * Событие без агентства не отбрасывается: агентство ищется по плательщику,
 * которого мы записали при первом же событии. Событие, которое не удалось
 * связать ни с кем, не применяется — оно не наше.
 */
export async function applySubscriptionChange(
  db: Database,
  change: SubscriptionChange,
): Promise<WebhookOutcome> {
  const known = await getSubscriptionByCustomer(db, change.customerId);
  const agencyId = change.agencyId ?? known?.agencyId ?? null;

  if (!agencyId) {
    return { applied: false, reason: "No agency is linked to this customer." };
  }

  // План приходит не в каждом событии (в завершённом checkout цены нет),
  // поэтому недостающее берётся из уже записанного состояния.
  const plan = change.plan ?? known?.plan ?? "starter";

  const saved = await upsertSubscription(db, {
    agencyId,
    customerId: change.customerId,
    subscriptionId: change.subscriptionId,
    plan,
    status: change.status,
    currentPeriodEnd: change.currentPeriodEnd,
    cancelAtPeriodEnd: change.cancelAtPeriodEnd,
  });

  // Поля агентства — производные от подписки, и они должны следовать за ней:
  // по ним считается лимит клиентов на горячем пути.
  const entitlements = entitlementsFor({
    plan: saved.plan,
    status: saved.status,
    currentPeriodEnd: saved.currentPeriodEnd,
    cancelAtPeriodEnd: saved.cancelAtPeriodEnd,
  });

  await applyPlanToAgency(db, agencyId, entitlements.plan, entitlements.clientLimit);

  return { applied: true, agencyId, plan: saved.plan, status: saved.status };
}
