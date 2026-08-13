import type { PlanId, SubscriptionStatus } from "./entitlements";

/**
 * Приём денег — за интерфейсом, как и всё внешнее в этом пакете.
 *
 * Продукт обязан работать без платёжного провайдера: агентство заводит
 * клиентов и меряет видимость на starter-лимитах, а недоступный биллинг
 * не должен превращаться в недоступный продукт.
 */

export interface CheckoutInput {
  agencyId: string;
  plan: PlanId;
  email: string;
  successUrl: string;
  cancelUrl: string;
  /** Уже известный плательщик: без него провайдер заведёт второго. */
  customerId?: string;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface PortalInput {
  customerId: string;
  returnUrl: string;
}

/** Слепок подписки из события провайдера — то, что нужно записать в базу. */
export interface SubscriptionChange {
  kind: "subscription";
  /** Агентство берётся из метаданных сессии: чужую подписку записать нельзя. */
  agencyId: string | null;
  customerId: string;
  subscriptionId: string | null;
  plan: PlanId | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Событие, которое продукт сознательно не обрабатывает. */
export interface IgnoredEvent {
  kind: "ignored";
  type: string;
  reason: string;
}

export type PaymentEvent = SubscriptionChange | IgnoredEvent;

export interface PaymentProvider {
  /** Настроен ли приём денег. Интерфейс не должен показывать кнопку, которая не сработает. */
  readonly configured: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  createPortal(input: PortalInput): Promise<{ url: string }>;
  /** Проверяет подпись и переводит событие провайдера в наши термины. */
  parseEvent(payload: string, signature: string): Promise<PaymentEvent>;
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super(
      "Payments are not configured. Set STRIPE_SECRET_KEY and the plan price IDs to accept subscriptions.",
    );
    this.name = "PaymentsNotConfiguredError";
  }
}

/**
 * Провайдер по умолчанию: денег не берёт и не притворяется, что берёт.
 *
 * Никакой имитации оплаты: фальшивый checkout, который «проводит» платёж,
 * однажды доедет до продакшена и выдаст бесплатный доступ за настоящий.
 */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly configured = false;

  createCheckout(): Promise<CheckoutSession> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }

  createPortal(): Promise<{ url: string }> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }

  parseEvent(): Promise<PaymentEvent> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }
}
