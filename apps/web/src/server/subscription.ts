import {
  DEFAULT_PLAN,
  entitlementsFor,
  type Entitlements,
  type PlanId,
  type SubscriptionChange,
  type SubscriptionField,
  type SubscriptionStatus,
} from "@repo/core";
import {
  applyPlanToAgency,
  getSubscriptionByAgency,
  getSubscriptionByCustomer,
  upsertSubscription,
  type Database,
  type Subscription,
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
 *
 * Записанная строка читается ровно один раз и на два вопроса сразу:
 * не устарело ли событие и чем заполнить то, о чём оно молчит. Оба правила
 * живут здесь и только здесь — два умолчания для одного поля однажды
 * разойдутся, а ценой расхождения будет тариф агентства.
 *
 * `occurredAt` — время события у провайдера. Без него (вызов не из вебхука)
 * порядок не проверяется и отметка не ставится.
 */
export async function applySubscriptionChange(
  db: Database,
  change: SubscriptionChange,
  occurredAt: Date | null = null,
): Promise<WebhookOutcome> {
  const known = await getSubscriptionByCustomer(db, change.customerId);
  const agencyId = change.agencyId ?? known?.agencyId ?? null;

  if (!agencyId) {
    return { applied: false, reason: "No agency is linked to this customer." };
  }

  // Порядок доставки Stripe не гарантирует: задержавшееся событие о
  // подписке приходит после более позднего и откатывает тариф назад.
  // Журнал по идентификатору тут не помогает — идентификаторы разные.
  //
  // По времени сравниваются только события, которые приносят тариф
  // целиком. Завершённый checkout и счета тарифа не знают, а их время
  // отличается от времени события о подписке на доли секунды в любую
  // сторону: отбросить по времени checkout значит потерять связь с
  // агентством, а счёт — не заметить сбоя платежа. Пустая отметка значит
  // «записано до того, как мы это отслеживали», и запись не блокирует.
  const carriesPlan = change.plan !== null;

  if (
    carriesPlan &&
    occurredAt &&
    known?.lastEventAt &&
    known.lastEventAt.getTime() > occurredAt.getTime()
  ) {
    return { applied: false, reason: "A newer event has already been applied." };
  }

  const fields = resolveFields(change, known);

  const saved = await upsertSubscription(db, {
    agencyId,
    customerId: change.customerId,
    subscriptionId: change.subscriptionId,
    plan: fields.plan,
    status: change.status,
    currentPeriodEnd: fields.currentPeriodEnd,
    cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
    // Отметку ставят только события, по которым потом сравнивается порядок:
    // иначе счёт или checkout подняли бы её и заблокировали событие о
    // подписке, пришедшее на долю секунды «раньше». Остальные переписывают
    // её тем же значением — `upsertSubscription` обновляет это поле наравне
    // с прочими, и не передать его значило бы стереть.
    lastEventAt: carriesPlan ? occurredAt : (known?.lastEventAt ?? null),
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

/**
 * Заполняет поля, о которых событие молчит, из уже записанного состояния.
 *
 * Единственное место, где это правило существует: счёт не знает ни тарифа,
 * ни конца оплаченного периода, и записать по нему `null` значит стереть
 * срок, по которому считается отсрочка при сбое платежа.
 *
 * Хвост `?? DEFAULT_PLAN` нужен ровно одному случаю — самому первому
 * завершённому checkout: цены в сессии нет, а записанного состояния ещё нет
 * тоже. Тариф приедет следующим событием о самой подписке.
 */
function resolveFields(
  change: SubscriptionChange,
  known: Subscription | undefined,
): { plan: PlanId; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean } {
  const unknown = change.unknownFields ?? [];
  const silent = (field: SubscriptionField): boolean => unknown.includes(field);

  return {
    plan: (silent("plan") ? null : change.plan) ?? known?.plan ?? DEFAULT_PLAN,
    currentPeriodEnd: silent("currentPeriodEnd")
      ? (known?.currentPeriodEnd ?? null)
      : change.currentPeriodEnd,
    cancelAtPeriodEnd: silent("cancelAtPeriodEnd")
      ? (known?.cancelAtPeriodEnd ?? false)
      : change.cancelAtPeriodEnd,
  };
}
