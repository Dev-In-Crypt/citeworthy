import type { PlanId, SubscriptionStatus } from "./entitlements";
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentEvent,
  PaymentProvider,
  PortalInput,
} from "./payments";

/**
 * Живой платёжный провайдер (Stripe).
 *
 * Обмен идёт через `fetch` формами, как требует их API, без SDK: сборка
 * герметична, а весь внешний обмен продукта и так живёт за интерфейсами.
 * Подпись вебхука проверяется WebCrypto — в этом пакете нет node-зависимостей.
 */

const API = "https://api.stripe.com/v1";

/** Допуск по времени для подписи вебхука: столько же, сколько у самого Stripe. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface StripePrices {
  starter: string;
  growth: string;
  scale: string;
}

export interface StripePaymentProviderConfig {
  secretKey: string;
  webhookSecret: string;
  prices: StripePrices;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  /** Подменяется в тестах: подпись проверяется относительно момента времени. */
  now?: () => Date;
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "canceled",
};

export class StripePaymentProvider implements PaymentProvider {
  readonly configured = true;

  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly planByPrice: Map<string, PlanId>;

  constructor(private readonly config: StripePaymentProviderConfig) {
    if (!config.secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set.");
    }
    if (!config.webhookSecret) {
      // Без секрета вебхука любой желающий мог бы выдать себе план.
      throw new Error("STRIPE_WEBHOOK_SECRET is not set — webhooks cannot be trusted without it.");
    }

    this.endpoint = config.endpoint ?? API;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.planByPrice = new Map(
      (Object.entries(config.prices) as [PlanId, string][])
        .filter(([, price]) => Boolean(price))
        .map(([plan, price]) => [price, plan]),
    );
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const price = this.config.prices[input.plan];
    if (!price) {
      throw new Error(`No Stripe price configured for the ${input.plan} plan.`);
    }

    const form: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Агентство едет и в сессии, и в подписке: событий приходит два разных,
      // и по любому из них должно быть понятно, чьи это деньги.
      client_reference_id: input.agencyId,
      "metadata[agency_id]": input.agencyId,
      "subscription_data[metadata][agency_id]": input.agencyId,
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
    };

    const session = await this.post<{ id: string; url: string | null }>(
      "/checkout/sessions",
      form,
    );
    if (!session.url) {
      throw new Error("Stripe created a checkout session without a URL.");
    }

    return { url: session.url, sessionId: session.id };
  }

  async createPortal(input: PortalInput): Promise<{ url: string }> {
    const session = await this.post<{ url: string }>("/billing_portal/sessions", {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  async parseEvent(payload: string, signature: string): Promise<PaymentEvent> {
    await verifyStripeSignature({
      payload,
      signature,
      secret: this.config.webhookSecret,
      now: this.now(),
    });

    const event = JSON.parse(payload) as StripeEvent;
    return this.translate(event);
  }

  private translate(event: StripeEvent): PaymentEvent {
    switch (event.type) {
      case "checkout.session.completed": {
        const object = event.data.object as StripeCheckoutSession;
        return {
          kind: "subscription",
          agencyId: object.client_reference_id ?? object.metadata?.agency_id ?? null,
          customerId: asId(object.customer),
          subscriptionId: object.subscription ? asId(object.subscription) : null,
          // План приедет следом, событием о самой подписке: в сессии цены нет.
          plan: null,
          status: "active",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const object = event.data.object as StripeSubscription;
        const priceId = object.items?.data?.[0]?.price?.id ?? null;
        const periodEnd =
          object.current_period_end ?? object.items?.data?.[0]?.current_period_end ?? null;

        return {
          kind: "subscription",
          agencyId: object.metadata?.agency_id ?? null,
          customerId: asId(object.customer),
          subscriptionId: object.id,
          plan: priceId ? (this.planByPrice.get(priceId) ?? null) : null,
          status:
            event.type === "customer.subscription.deleted"
              ? "canceled"
              : (STATUS_MAP[object.status] ?? "incomplete"),
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        };
      }

      default:
        return {
          kind: "ignored",
          type: event.type,
          reason: "The product only reacts to checkout and subscription events.",
        };
    }
  }

  private async post<T>(path: string, form: Record<string, string>): Promise<T> {
    const response = await this.fetchImpl(`${this.endpoint}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Stripe responded ${response.status}: ${body.slice(0, 500)}`);
    }

    return (await response.json()) as T;
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

interface StripeCheckoutSession {
  customer: string | { id: string };
  subscription: string | { id: string } | null;
  client_reference_id: string | null;
  metadata?: { agency_id?: string };
}

interface StripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: { agency_id?: string };
  items?: { data?: { price?: { id: string }; current_period_end?: number }[] };
}

function asId(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Проверка подписи вебхука.
 *
 * Отдельная функция, а не приватный метод: это единственное место, где
 * решается, верить ли внешнему запросу, меняющему план агентства, и оно
 * должно проверяться тестами напрямую.
 */
export async function verifyStripeSignature(input: {
  payload: string;
  signature: string;
  secret: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const parts = new Map(
    input.signature
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([key, value]) => [key, value] as [string, string]),
  );

  const timestamp = parts.get("t");
  const provided = parts.get("v1");
  if (!timestamp || !provided) {
    throw new WebhookSignatureError("Malformed Stripe-Signature header.");
  }

  const ageSeconds = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    // Старую подпись можно переиграть: без проверки времени перехваченный
    // запрос «подписка отменена» работал бы вечно.
    throw new WebhookSignatureError("Stripe-Signature is outside the tolerance window.");
  }

  const expected = await hmacSha256Hex(input.secret, `${timestamp}.${input.payload}`);
  if (!timingSafeEqual(expected, provided)) {
    throw new WebhookSignatureError("Stripe-Signature does not match the payload.");
  }
}

/** Подпись строки — тем же алгоритмом, что и у Stripe. Используется в тестах. */
export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Сравнение за постоянное время: длина ответа не должна подсказывать подпись. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
