import { type PaymentEventEnvelope, type PaymentEventLedger } from "@repo/core";
import { type Database } from "@repo/db";
import { applySubscriptionChange, type WebhookOutcome } from "@/server/subscription";

/**
 * Применение события провайдера — ровно один раз.
 *
 * Провайдер доставляет событие «хотя бы один раз»: повторная доставка после
 * нашего таймаута или 500 — штатная работа Stripe, и второй проход не должен
 * ни поднять тариф дважды, ни отправить письмо дважды. Занять событие в
 * журнале до записи — единственное, чем этот слой отличается от прямой
 * записи.
 *
 * Чем заполнять то, о чём событие молчит, и что делать с событием не по
 * порядку, решает `applySubscriptionChange`: там уже читается записанное
 * состояние, и второе такое же правило рядом однажды разойдётся с первым —
 * ценой расхождения будет тариф агентства.
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

    const outcome = await applySubscriptionChange(db, envelope.event, envelope.occurredAt);

    if (!outcome.applied) {
      // Событие не наше или устарело — повторять его незачем, журнал не
      // трогаем: повтор той же доставки должен остаться повтором.
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
