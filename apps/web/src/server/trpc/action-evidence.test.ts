import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgency, createClient, createDb, deleteAgency, listActions } from "@repo/db";
import { promptClusters } from "@repo/db/schema/measurement";
import type { Recommendation } from "@repo/core";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/**
 * Verify T80: числа, на которых стоит рекомендация, доезжают до действия,
 * а повтор для другого кластера расширяет охват, а не теряется.
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

function caller(agencyId: string) {
  const user: SessionUser = {
    id: crypto.randomUUID(),
    email: "owner@test.local",
    name: "Owner",
    agencyId,
    role: "owner",
  };
  return appRouter.createCaller({ db, user } as TrpcContext);
}

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    actionType: "review_platform",
    title: "Get the client covered on g2.com",
    reason:
      "g2.com is cited in 18% of answers here (14 citations). NeoAttack appear in those answers; the client does not.",
    estimatedImpact: "high",
    effort: "low",
    sourceDomain: "g2.com",
    rule: "missing-from-influential-source",
    evidence: {
      sourceType: "review",
      citations: 14,
      sharePct: 18,
      competitorsPresent: ["NeoAttack"],
    },
    ...overrides,
  };
}

describe("доказательства действия", () => {
  let agencyId = "";
  let clientId = "";
  let clusterA = "";
  let clusterB = "";

  beforeEach(async () => {
    agencyId = (await createAgency(db, { name: "Evidence Agency", clientLimit: 10 })).id;
    const client = await createClient(db, {
      agencyId,
      name: "Pisto",
      domain: "agenciapisto.test",
      brandNames: ["Pisto"],
      competitorNames: ["NeoAttack"],
    });
    clientId = client.id;

    clusterA = (
      await db
        .insert(promptClusters)
        .values({ clientId, name: "Búsqueda", intent: "comparison" })
        .returning()
    )[0]!.id;
    clusterB = (
      await db
        .insert(promptClusters)
        .values({ clientId, name: "Precios", intent: "purchase" })
        .returning()
    )[0]!.id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("числа сохраняются структурно, а не только внутри текста", async () => {
    const { action } = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: recommendation({ clusterId: clusterA }),
    });

    expect(action.evidence).toMatchObject({
      sourceType: "review",
      citations: 14,
      sharePct: 18,
      competitorsPresent: ["NeoAttack"],
    });
  });

  it("тот же источник в другом кластере расширяет охват, а не создаёт дубль", async () => {
    const first = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: recommendation({ clusterId: clusterA }),
    });
    const second = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: recommendation({ clusterId: clusterB }),
    });

    expect(second.created).toBe(false);
    expect(second.action.id).toBe(first.action.id);
    // Массив кластеров задаёт treatment-группу эксперимента: потеряв кластер,
    // мы измеряли бы потом не то, что делали.
    expect(second.action.affectedClusterIds.sort()).toEqual([clusterA, clusterB].sort());
    expect(await listActions(db, clientId)).toHaveLength(1);
  });

  it("повтор того же кластера ничего не меняет", async () => {
    await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: recommendation({ clusterId: clusterA }),
    });
    const again = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: recommendation({ clusterId: clusterA }),
    });

    expect(again.action.affectedClusterIds).toEqual([clusterA]);
  });

  it("рекомендация без доказательств по-прежнему превращается в действие", async () => {
    const { action } = await caller(agencyId).actions.convertFromRecommendation({
      clientId,
      recommendation: recommendation({ evidence: undefined, sourceDomain: "capterra.com" }),
    });

    expect(action.evidence).toBeNull();
    expect(action.reason.length).toBeGreaterThan(0);
  });
});
