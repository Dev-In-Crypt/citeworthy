import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hmacSha256Hex,
  InMemoryPaymentEventLedger,
  PLAN_LIMITS,
  StripePaymentProvider,
} from "@repo/core";
import {
  createAgency,
  createDb,
  deleteAgency,
  getAgencyById,
  getSubscriptionByAgency,
} from "@repo/db";
import {
  setPaymentEventLedger,
  setPaymentProvider,
  getPaymentEventLedger,
} from "@/server/payments";
import { POST } from "./route";

/**
 * Вебхук — единственный вход, который меняет права агентства без участия
 * человека, поэтому проверяется целиком: настоящая подпись HMAC, повторная
 * доставка того же события и счёт, который не должен стирать срок отсрочки.
 */

const { db, close } = createDb();

const SECRET = "whsec_test_only_not_a_real_key";
const PRICES = { starter: "price_starter", growth: "price_growth", scale: "price_scale" };

const provider = new StripePaymentProvider({
  secretKey: "sk_test_not_a_real_key",
  webhookSecret: SECRET,
  prices: PRICES,
  // Сеть не трогается: вебхук ходит только в разбор подписи.
  fetchImpl: (() => {
    throw new Error("the webhook must not call Stripe");
  }) as unknown as typeof fetch,
});

afterAll(async () => {
  setPaymentProvider(null);
  setPaymentEventLedger(null);
  await close();
});

/** Подпись считается тем же алгоритмом, что у Stripe, а не подменяется. */
async function post(event: unknown, at = new Date()): Promise<Response> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(at.getTime() / 1000);
  const signature = await hmacSha256Hex(SECRET, `${timestamp}.${payload}`);

  return POST(
    new Request("https://app.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: payload,
    }),
  );
}

function subscriptionEvent(patch: {
  id: string;
  agencyId?: string;
  customerId: string;
  price?: string;
  status?: string;
  type?: string;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}) {
  return {
    id: patch.id,
    object: "event",
    api_version: "2025-04-30.basil",
    created: 1_790_000_000,
    type: patch.type ?? "customer.subscription.updated",
    data: {
      object: {
        id: "sub_live_1",
        object: "subscription",
        customer: patch.customerId,
        status: patch.status ?? "active",
        cancel_at_period_end: patch.cancelAtPeriodEnd ?? false,
        ...(patch.agencyId ? { metadata: { agency_id: patch.agencyId } } : { metadata: {} }),
        items: {
          object: "list",
          data: [
            {
              id: "si_live_1",
              object: "subscription_item",
              current_period_end: patch.periodEnd ?? 1_792_000_000,
              price: { id: patch.price ?? "price_growth", object: "price" },
              quantity: 1,
            },
          ],
        },
      },
    },
  };
}

describe("stripe webhook", () => {
  let agencyId = "";
  let customerId = "";

  beforeEach(async () => {
    setPaymentProvider(provider);
    setPaymentEventLedger(new InMemoryPaymentEventLedger());
    const agency = await createAgency(db, { name: "Webhook Agency", clientLimit: 3 });
    agencyId = agency.id;
    customerId = `cus_${agency.id.slice(0, 8)}`;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("без подписи ничего не происходит", async () => {
    const response = await POST(
      new Request("https://app.test/api/webhooks/stripe", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(400);
  });

  it("подпись чужим секретом отвергается, план не меняется", async () => {
    const payload = JSON.stringify(subscriptionEvent({ id: "evt_forged", agencyId, customerId }));
    const timestamp = Math.floor(Date.now() / 1000);
    const forged = await hmacSha256Hex("whsec_someone_else", `${timestamp}.${payload}`);

    const response = await POST(
      new Request("https://app.test/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": `t=${timestamp},v1=${forged}` },
        body: payload,
      }),
    );

    expect(response.status).toBe(400);
    expect(await getSubscriptionByAgency(db, agencyId)).toBeUndefined();
  });

  it("оплата поднимает тариф агентства", async () => {
    const response = await post(
      subscriptionEvent({ id: "evt_paid", agencyId, customerId, price: "price_scale" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: true });

    const agency = await getAgencyById(db, agencyId);
    expect(agency?.plan).toBe("scale");
    expect(agency?.clientLimit).toBe(PLAN_LIMITS.scale.clientLimit);
  });

  it("повторная доставка того же события второй раз ничего не меняет", async () => {
    const event = subscriptionEvent({ id: "evt_once", agencyId, customerId, price: "price_scale" });

    await post(event);
    const saved = await getSubscriptionByAgency(db, agencyId);

    // Stripe повторяет доставку после таймаута — с тем же идентификатором.
    const repeat = await post(event);
    expect(repeat.status).toBe(200);
    await expect(repeat.json()).resolves.toMatchObject({ applied: false, status: "duplicate" });

    const after = await getSubscriptionByAgency(db, agencyId);
    expect(after?.plan).toBe("scale");
    // Ни новой записи, ни нового времени правки: второй проход не состоялся.
    expect(after?.id).toBe(saved?.id);
    expect(after?.updatedAt.toISOString()).toBe(saved?.updatedAt.toISOString());
  });

  it("повтор после отмены не воскрешает старый тариф", async () => {
    const paid = subscriptionEvent({ id: "evt_a", agencyId, customerId, price: "price_scale" });
    const cancelled = subscriptionEvent({
      id: "evt_b",
      agencyId,
      customerId,
      price: "price_scale",
      type: "customer.subscription.deleted",
    });

    await post(paid);
    await post(cancelled);
    // Провайдер повторяет первое событие, потому что наш ответ на него потерялся.
    await post(paid);

    const agency = await getAgencyById(db, agencyId);
    expect(agency?.plan).toBe("starter");
    expect((await getSubscriptionByAgency(db, agencyId))?.status).toBe("canceled");
  });

  it("сбой списания оставляет тариф и срок оплаченного периода на месте", async () => {
    await post(
      subscriptionEvent({
        id: "evt_c",
        agencyId,
        customerId,
        price: "price_scale",
        periodEnd: 1_792_000_000,
      }),
    );

    const failure = {
      id: "evt_d",
      object: "event",
      created: 1_791_000_000,
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_1",
          object: "invoice",
          customer: customerId,
          billing_reason: "subscription_cycle",
          attempt_count: 1,
          status: "open",
          parent: { subscription_details: { subscription: "sub_live_1" } },
        },
      },
    };

    const response = await post(failure);
    expect(await response.json()).toMatchObject({ applied: true });

    const saved = await getSubscriptionByAgency(db, agencyId);
    expect(saved?.status).toBe("past_due");
    // Счёт не знает тарифа — записанный не должен превратиться в starter.
    expect(saved?.plan).toBe("scale");
    // И не знает срока — без него отсрочка считалась бы от пустоты.
    expect(saved?.currentPeriodEnd?.toISOString()).toBe(
      new Date(1_792_000_000 * 1000).toISOString(),
    );
  });

  it("удачное списание возвращает агентство в строй", async () => {
    await post(
      subscriptionEvent({
        id: "evt_e",
        agencyId,
        customerId,
        price: "price_growth",
        status: "past_due",
      }),
    );

    await post({
      id: "evt_f",
      object: "event",
      created: 1_791_500_000,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_2",
          object: "invoice",
          customer: customerId,
          billing_reason: "subscription_cycle",
          status: "paid",
          parent: { subscription_details: { subscription: "sub_live_1" } },
        },
      },
    });

    const saved = await getSubscriptionByAgency(db, agencyId);
    expect(saved?.status).toBe("active");
    expect(saved?.plan).toBe("growth");
  });

  it("событие, которое продукт не разбирает, отмечается доставленным", async () => {
    const response = await post({
      id: "evt_g",
      object: "event",
      created: 1_790_000_000,
      type: "customer.updated",
      data: { object: { id: customerId, object: "customer" } },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ignored" });
  });

  it("сбой записи отпускает событие, и повтор его применяет", async () => {
    const ledger = getPaymentEventLedger();
    const event = subscriptionEvent({ id: "evt_h", agencyId, customerId, price: "price_scale" });

    // Журнал занял событие, но применить его не удалось — так выглядит
    // упавшая запись в базу. Провайдер повторит доставку.
    await ledger.claim("evt_h", new Date());
    await ledger.release("evt_h");

    const response = await post(event);
    await expect(response.json()).resolves.toMatchObject({ applied: true });
    expect((await getSubscriptionByAgency(db, agencyId))?.plan).toBe("scale");
  });

  it("чужая отмена не трогает наше агентство", async () => {
    await post(subscriptionEvent({ id: "evt_i", agencyId, customerId, price: "price_scale" }));

    const response = await post(
      subscriptionEvent({
        id: "evt_j",
        customerId: "cus_someone_else",
        type: "customer.subscription.deleted",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({ applied: false });
    expect((await getAgencyById(db, agencyId))?.plan).toBe("scale");
  });
});
