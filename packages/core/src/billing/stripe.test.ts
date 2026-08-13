import { describe, expect, it, vi } from "vitest";
import {
  StripePaymentProvider,
  WebhookSignatureError,
  hmacSha256Hex,
  verifyStripeSignature,
} from "./stripe";
import { PaymentsNotConfiguredError, UnconfiguredPaymentProvider } from "./payments";
import { createPaymentProvider } from "./provider";

/**
 * Verify T86: подпись вебхука проверяется по-настоящему (иначе план агентства
 * меняет кто угодно), события переводятся в наши термины, а без ключей
 * продукт не притворяется, что принимает деньги.
 */

const PRICES = { starter: "price_starter", growth: "price_growth", scale: "price_scale" };
const SECRET = "whsec_test";

function provider(overrides: Partial<ConstructorParameters<typeof StripePaymentProvider>[0]> = {}) {
  return new StripePaymentProvider({
    secretKey: "sk_test",
    webhookSecret: SECRET,
    prices: PRICES,
    ...overrides,
  });
}

async function sign(payload: string, at: Date, secret = SECRET): Promise<string> {
  const timestamp = Math.floor(at.getTime() / 1000);
  const signature = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return `t=${timestamp},v1=${signature}`;
}

describe("verifyStripeSignature", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const payload = JSON.stringify({ id: "evt_1", type: "ping" });

  it("своя подпись проходит", async () => {
    await expect(
      verifyStripeSignature({ payload, signature: await sign(payload, now), secret: SECRET, now }),
    ).resolves.toBeUndefined();
  });

  it("подпись чужим секретом отвергается", async () => {
    const signature = await sign(payload, now, "whsec_someone_else");

    await expect(
      verifyStripeSignature({ payload, signature, secret: SECRET, now }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("подменённое тело отвергается", async () => {
    const signature = await sign(payload, now);

    await expect(
      verifyStripeSignature({
        payload: JSON.stringify({ id: "evt_1", type: "customer.subscription.deleted" }),
        signature,
        secret: SECRET,
        now,
      }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("старая подпись не переигрывается", async () => {
    const signature = await sign(payload, new Date(now.getTime() - 10 * 60_000));

    await expect(
      verifyStripeSignature({ payload, signature, secret: SECRET, now }),
    ).rejects.toThrow(/tolerance/i);
  });

  it("кривой заголовок отвергается", async () => {
    await expect(
      verifyStripeSignature({ payload, signature: "nonsense", secret: SECRET, now }),
    ).rejects.toThrow(/Malformed/i);
  });
});

describe("parseEvent", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  async function parse(event: unknown) {
    const payload = JSON.stringify(event);
    return provider({ now: () => now }).parseEvent(payload, await sign(payload, now));
  }

  it("подписка переводится в план, статус и конец периода", async () => {
    const result = await parse({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: 1_790_000_000,
          metadata: { agency_id: "agency-uuid" },
          items: { data: [{ price: { id: "price_growth" } }] },
        },
      },
    });

    expect(result).toMatchObject({
      kind: "subscription",
      agencyId: "agency-uuid",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      plan: "growth",
      status: "active",
      cancelAtPeriodEnd: false,
    });
  });

  it("удаление подписки — это отмена, чем бы ни был её статус", async () => {
    const result = await parse({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          metadata: { agency_id: "agency-uuid" },
          items: { data: [{ price: { id: "price_growth" } }] },
        },
      },
    });

    expect(result).toMatchObject({ kind: "subscription", status: "canceled" });
  });

  it("незнакомая цена не превращается в план наугад", async () => {
    const result = await parse({
      id: "evt_3",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_2",
          customer: "cus_2",
          status: "active",
          items: { data: [{ price: { id: "price_from_another_product" } }] },
        },
      },
    });

    expect(result).toMatchObject({ kind: "subscription", plan: null });
  });

  it("завершённый checkout приносит плательщика и агентство", async () => {
    const result = await parse({
      id: "evt_4",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_3",
          subscription: "sub_3",
          client_reference_id: "agency-uuid",
        },
      },
    });

    expect(result).toMatchObject({
      kind: "subscription",
      agencyId: "agency-uuid",
      customerId: "cus_3",
      subscriptionId: "sub_3",
    });
  });

  it("остальные события пропускаются осознанно", async () => {
    const result = await parse({ id: "evt_5", type: "invoice.paid", data: { object: {} } });

    expect(result).toMatchObject({ kind: "ignored", type: "invoice.paid" });
  });
});

describe("createCheckout", () => {
  it("отправляет цену плана и метку агентства", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.test/cs_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const session = await provider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).createCheckout({
      agencyId: "agency-uuid",
      plan: "scale",
      email: "owner@agency.test",
      successUrl: "https://app.test/settings/billing?paid=1",
      cancelUrl: "https://app.test/settings/billing",
    });

    expect(session.url).toBe("https://checkout.test/cs_1");

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get("line_items[0][price]")).toBe("price_scale");
    expect(form.get("client_reference_id")).toBe("agency-uuid");
    expect(form.get("subscription_data[metadata][agency_id]")).toBe("agency-uuid");
    expect(form.get("customer_email")).toBe("owner@agency.test");
  });
});

describe("createPaymentProvider", () => {
  it("без ключа продукт не притворяется, что принимает оплату", async () => {
    const payments = createPaymentProvider({});

    expect(payments).toBeInstanceOf(UnconfiguredPaymentProvider);
    expect(payments.configured).toBe(false);
    await expect(payments.createCheckout({} as never)).rejects.toBeInstanceOf(
      PaymentsNotConfiguredError,
    );
  });

  it("ключ без секрета вебхука — ошибка, а не доверчивый режим", () => {
    expect(() => createPaymentProvider({ STRIPE_SECRET_KEY: "sk_test" })).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });

  it("настроенная половина планов отвергается", () => {
    expect(() =>
      createPaymentProvider({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec",
        STRIPE_PRICE_STARTER: "price_starter",
      }),
    ).toThrow(/growth, scale/);
  });

  it("полный набор ключей даёт живого провайдера", () => {
    const payments = createPaymentProvider({
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_WEBHOOK_SECRET: "whsec",
      STRIPE_PRICE_STARTER: "price_starter",
      STRIPE_PRICE_GROWTH: "price_growth",
      STRIPE_PRICE_SCALE: "price_scale",
    });

    expect(payments.configured).toBe(true);
  });
});
