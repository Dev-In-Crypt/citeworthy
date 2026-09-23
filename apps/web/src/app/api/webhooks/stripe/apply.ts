import {
  type PaymentEventEnvelope,
  type PaymentEventLedger,
  type SubscriptionChange,
} from "@repo/core";
import { getSubscriptionByCustomer, type Database } from "@repo/db";
import { applySubscriptionChange, type WebhookOutcome } from "@/server/subscription";

/**
 * Применение события провайдера — ровно один раз и без потери того,
 * о чём событие молчит.
 *
 * Два свойства, которых нет в самой записи в базу:
 *
 * 1. Провайдер доставляет событие «хотя бы один раз». Повторная доставка
 *    после нашего таймаута или 500 — штатная работа Stripe, и второй
 *    проход не должен ни поднять тариф дважды, ни отправить письмо дважды.
 * 2. Счёт не знает ни тарифа, ни конца оплаченного периода. Записать по
 *    нему `null` значит стереть срок, по которому считается отсрочка при
 *    сбое платежа, — и выключить агентство раньше времени.
 */

export type WebhookResult =
  | { status: "applied"; outcome: WebhookOutcome }
  | { status: "duplicate"; reason: string }
  | { status: "ignored"; reason: string };

export async function applyPaymentEvent(
  db: Database,
  envelope: PaymentEventEnvelope,
  ledger: PaymentEventLedger,
): Promise<WebhookResult> {
  // Занять событие до записи: между проверкой и применением провайдер
  // успевает прислать повтор.
  const claim = await ledger.claim(envelope.eventId, envelope.occurredAt);
  if (!claim.claimed) {
    return { status: "duplicate", reason: claim.reason };
  }

  try {
    if (envelope.event.kind === "ignored") {
      return { status: "ignored", reason: envelope.event.reason };
    }

    const change = await fillUnknownFields(db, envelope.event);
    const outcome = await applySubscriptionChange(db, change);

    if (!outcome.applied) {
      // Событие не наше — повторять его незачем, журнал не трогаем.
      return { status: "ignored", reason: outcome.reason };
    }

    return { status: "applied", outcome };
  } catch (error) {
    // Запись не удалась — событие обработанным не считается: провайдер
    // повторит доставку, и повтор должен пройти.
    await ledger.release(envelope.eventId);
    throw error;
  }
}

/**
 * Подставляет в событие то, о чём оно не говорит, из уже записанного.
 *
 * Плательщик есть в каждом событии, и по нему находится подписка: так
 * `invoice.payment_failed` меняет только статус, оставляя тариф и конец
 * периода на месте.
 */
async function fillUnknownFields(
  db: Database,
  change: SubscriptionChange,
): Promise<SubscriptionChange> {
  const unknown = change.unknownFields ?? [];
  if (unknown.length === 0) {
    return change;
  }

  const known = await getSubscriptionByCustomer(db, change.customerId);
  if (!known) {
    return change;
  }

  return {
    ...change,
    plan: unknown.includes("plan") ? known.plan : change.plan,
    currentPeriodEnd: unknown.includes("currentPeriodEnd")
      ? known.currentPeriodEnd
      : change.currentPeriodEnd,
    cancelAtPeriodEnd: unknown.includes("cancelAtPeriodEnd")
      ? known.cancelAtPeriodEnd
      : change.cancelAtPeriodEnd,
  };
}
