import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { makeRecommendation } from "@repo/core";
import { createAgency, createClient, createDb, deleteAgency, listActions } from "@repo/db";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/** Verify T40: конвертация рекомендации в действие. */

const { db, close } = createDb();

// Соединение закрывается на уровне файла: afterAll внутри describe оборвал бы
// его для следующего блока тестов.
afterAll(async () => {
  await close();
});

function caller(agencyId: string, role: SessionUser["role"] = "owner") {
  const user: SessionUser = {
    id: crypto.randomUUID(),
    email: "owner@test.local",
    name: "Owner",
    agencyId,
    role,
  };
  return appRouter.createCaller({ db, user } as TrpcContext);
}

const RECOMMENDATION = makeRecommendation({
  actionType: "review_platform",
  title: "Get the client covered on g2.com",
  reason: "g2.com is cited in 23% of answers here (12 citations). HubSpot appears; the client does not.",
  estimatedImpact: "high",
  effort: "low",
  sourceDomain: "g2.com",
  rule: "missing-from-influential-source",
});

describe("actions.convertFromRecommendation", () => {
  let agencyId = "";
  let clientId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Actions Agency", clientLimit: 10 });
    agencyId = agency.id;
    const client = await createClient(db, {
      agencyId,
      name: "AcmeCRM",
      domain: "acmecrm.test",
    });
    clientId = client.id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("переносит title, reason, тип и оценку из рекомендации", async () => {
    const { action, created } = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: RECOMMENDATION,
    });

    expect(created).toBe(true);
    expect(action.title).toBe(RECOMMENDATION.title);
    expect(action.reason).toBe(RECOMMENDATION.reason);
    expect(action.actionType).toBe("review_platform");
    expect(action.estimatedImpact).toBe("high");
    expect(action.sourceDomain).toBe("g2.com");
    // Правило сохраняется: видно, из какой рекомендации выросло действие.
    expect(action.originRule).toBe("missing-from-influential-source");
    expect(action.status).toBe("backlog");
  });

  it("повторный вызов не создаёт дубль", async () => {
    const api = caller(agencyId);
    await api.actions.convertFromRecommendation({ clientId, recommendation: RECOMMENDATION });
    const second = await api.actions.convertFromRecommendation({
      clientId,
      recommendation: RECOMMENDATION,
    });

    // Очередь действий — рабочий инструмент, а не журнал нажатий.
    expect(second.created).toBe(false);
    expect(await listActions(db, clientId)).toHaveLength(1);
  });

  it("рекомендация с пустым reason отвергается на сервере", async () => {
    const api = caller(agencyId);

    await expect(
      api.actions.convertFromRecommendation({
        clientId,
        // Клиент может прислать что угодно: инвариант проверяется на сервере,
        // а не только в генераторе рекомендаций.
        recommendation: { ...RECOMMENDATION, reason: "" },
      }),
    ).rejects.toThrow();
  });

  it("клиент другого агентства недоступен", async () => {
    const other = await createAgency(db, { name: "Other" });

    await expect(
      caller(other.id).actions.convertFromRecommendation({
        clientId,
        recommendation: RECOMMENDATION,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
    );

    await deleteAgency(db, other.id);
  });

  it("кластер рекомендации попадает в affected_cluster_ids", async () => {
    const clusterId = crypto.randomUUID();
    const { action } = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: makeRecommendation({ ...RECOMMENDATION, clusterId }),
    });

    // Это база для treatment-группы будущего эксперимента (T43).
    expect(action.affectedClusterIds).toEqual([clusterId]);
  });
});

describe("actions CRUD", () => {
  let agencyId = "";
  let clientId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "CRUD Agency", clientLimit: 10 });
    agencyId = agency.id;
    const client = await createClient(db, { agencyId, name: "AcmeCRM", domain: "acmecrm.test" });
    clientId = client.id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("создание вручную требует непустого reason", async () => {
    const api = caller(agencyId);

    await expect(
      api.actions.create({
        clientId,
        title: "Manual action",
        reason: "",
        actionType: "refresh_page",
        estimatedImpact: "medium",
        effort: "medium",
        affectedClusterIds: [],
      }),
    ).rejects.toThrow();
  });

  it("перевод в done проставляет дату завершения", async () => {
    const api = caller(agencyId);
    const created = await api.actions.create({
      clientId,
      title: "Manual action",
      reason: "Because the page is stale.",
      actionType: "refresh_page",
      estimatedImpact: "medium",
      effort: "medium",
      affectedClusterIds: [],
    });

    const updated = await api.actions.update({ id: created.id, status: "done" });

    // Без даты завершения эксперимент не сможет отделить «до» от «после».
    expect(updated?.status).toBe("done");
    expect(updated?.completedAt).toBeInstanceOf(Date);
  });

  it("возврат из done очищает дату завершения", async () => {
    const api = caller(agencyId);
    const created = await api.actions.create({
      clientId,
      title: "Manual action",
      reason: "Because the page is stale.",
      actionType: "refresh_page",
      estimatedImpact: "medium",
      effort: "medium",
      affectedClusterIds: [],
    });

    await api.actions.update({ id: created.id, status: "done" });
    const reopened = await api.actions.update({ id: created.id, status: "in_progress" });

    expect(reopened?.completedAt).toBeNull();
  });

  it("чужое действие недоступно", async () => {
    const api = caller(agencyId);
    const created = await api.actions.create({
      clientId,
      title: "Manual action",
      reason: "Because the page is stale.",
      actionType: "refresh_page",
      estimatedImpact: "medium",
      effort: "medium",
      affectedClusterIds: [],
    });

    const other = await createAgency(db, { name: "Other CRUD" });
    await expect(
      caller(other.id).actions.update({ id: created.id, status: "done" }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
    );

    await deleteAgency(db, other.id);
  });
});
