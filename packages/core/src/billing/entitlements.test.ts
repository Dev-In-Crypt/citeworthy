import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "./period";
import {
  PAST_DUE_GRACE_DAYS,
  canAddClient,
  entitlementsFor,
  type SubscriptionSnapshot,
} from "./entitlements";

/**
 * Verify T86: права считаются от подписки, а сбой платежа не выключает
 * продукт в тот же час — но и не длится вечно.
 */

const NOW = new Date("2026-09-15T12:00:00.000Z");

function snapshot(patch: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    plan: "growth",
    status: "active",
    currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    ...patch,
  };
}

describe("entitlementsFor", () => {
  it("без подписки работают лимиты starter", () => {
    const result = entitlementsFor(null, NOW);

    expect(result.plan).toBe("starter");
    expect(result.clientLimit).toBe(PLAN_LIMITS.starter.clientLimit);
    expect(result.active).toBe(true);
  });

  it("активная подписка даёт лимиты своего плана", () => {
    const result = entitlementsFor(snapshot(), NOW);

    expect(result.plan).toBe("growth");
    expect(result.clientLimit).toBe(PLAN_LIMITS.growth.clientLimit);
    expect(result.aiCheckAllowance).toBe(PLAN_LIMITS.growth.aiCheckAllowance);
    expect(result.active).toBe(true);
  });

  it("пробный период — это работающий продукт", () => {
    expect(entitlementsFor(snapshot({ status: "trialing" }), NOW).active).toBe(true);
  });

  it("отмена в конце периода не выключает продукт сейчас", () => {
    const result = entitlementsFor(snapshot({ cancelAtPeriodEnd: true }), NOW);

    expect(result.active).toBe(true);
    expect(result.reason).toMatch(/ends at the close/i);
  });

  it("непрошедший платёж оставляет доступ на время отсрочки", () => {
    const periodEnd = new Date("2026-09-10T00:00:00.000Z");
    const result = entitlementsFor(
      snapshot({ status: "past_due", currentPeriodEnd: periodEnd }),
      NOW,
    );

    expect(result.active).toBe(true);
    expect(result.plan).toBe("growth");
  });

  it("после отсрочки доступ закрывается", () => {
    const periodEnd = new Date("2026-09-10T00:00:00.000Z");
    const afterGrace = new Date(periodEnd.getTime() + (PAST_DUE_GRACE_DAYS + 1) * 86_400_000);

    const result = entitlementsFor(
      snapshot({ status: "past_due", currentPeriodEnd: periodEnd }),
      afterGrace,
    );

    expect(result.active).toBe(false);
  });

  it("отменённая подписка возвращает к starter и закрывает работу", () => {
    const result = entitlementsFor(snapshot({ status: "canceled" }), NOW);

    expect(result.plan).toBe("starter");
    expect(result.active).toBe(false);
    expect(result.reason).toMatch(/cancelled/i);
  });

  it("незавершённая оплата не даёт доступа", () => {
    expect(entitlementsFor(snapshot({ status: "incomplete" }), NOW).active).toBe(false);
  });
});

describe("canAddClient", () => {
  it("до лимита клиента завести можно", () => {
    const decision = canAddClient(entitlementsFor(null, NOW), 2);
    expect(decision.allowed).toBe(true);
  });

  it("на лимите отказ объясняет, что делать", () => {
    const decision = canAddClient(entitlementsFor(null, NOW), PLAN_LIMITS.starter.clientLimit);

    expect(decision.allowed).toBe(false);
    expect(decision.message).toContain("starter");
    expect(decision.message).toMatch(/upgrade/i);
  });

  it("выключенный аккаунт клиентов не заводит", () => {
    const decision = canAddClient(entitlementsFor(snapshot({ status: "canceled" }), NOW), 0);

    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/cancelled/i);
  });
});
