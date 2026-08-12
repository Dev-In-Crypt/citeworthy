import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgency, createClient, createDb, createRun, deleteAgency } from "@repo/db";
import { promptClusters, prompts } from "@repo/db/schema/measurement";
import { sources } from "@repo/db/schema/sources";
import { completeRun } from "@repo/pipeline";
import { reportPayloadSchema, REPORT_COPY } from "@repo/core";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/** Verify T62: payload аудита валиден, числа сходятся, маржа наружу не уходит. */

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

describe("reports.generateOpportunity", () => {
  let agencyId = "";
  let clientId = "";

  beforeEach(async () => {
    await db.delete(sources);

    const agency = await createAgency(db, { name: "Audit Agency", clientLimit: 10 });
    agencyId = agency.id;

    const client = await createClient(db, {
      agencyId,
      name: "AcmeCRM",
      domain: "acmecrm.test",
      brandNames: ["AcmeCRM", "Acme"],
      competitorNames: ["HubSpot", "Pipedrive"],
      status: "prospect",
    });
    clientId = client.id;

    const clusterId = (
      await db
        .insert(promptClusters)
        .values({ clientId, name: "CRM comparison", intent: "comparison" })
        .returning()
    )[0]!.id;

    await db.insert(prompts).values([
      { clusterId, text: "best CRM for startups" },
      { clusterId, text: "easiest CRM for a small sales team" },
    ]);

    const run = await createRun(db, { clientId, scheduleId: null, trigger: "manual" });
    await completeRun(db, run.id, clientId, "mock");
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("payload валиден по схеме C4 и несёт раздел аудита", async () => {
    const report = await caller(agencyId).reports.generateOpportunity({ clientId });
    const payload = reportPayloadSchema.parse(report.payload);

    expect(payload.opportunity).not.toBeNull();
    expect(payload.opportunity?.scopeDays).toBe(90);
    expect(payload.client.name).toBe("AcmeCRM");
  });

  it("видимость в разделе совпадает с последней свёрткой измерений", async () => {
    const report = await caller(agencyId).reports.generateOpportunity({ clientId });
    const payload = reportPayloadSchema.parse(report.payload);

    const visibility = await caller(agencyId).measurement.visibility({ clientId });
    const latest = visibility.series.at(-1);

    expect(payload.opportunity?.currentVisibilityPct).toBe(latest?.clientVisibilityPct);
  });

  it("маржа считается из введённых ретейнера, часов и стоимости часа", async () => {
    const report = await caller(agencyId).reports.generateOpportunity({
      clientId,
      retainerUsd: 4000,
      effortHoursMin: 10,
      effortHoursMax: 20,
      hourlyCostUsd: 100,
    });
    const payload = reportPayloadSchema.parse(report.payload);

    // 4000 − 10×100 = 3000 → 75%; 4000 − 20×100 = 2000 → 50%.
    expect(payload.opportunity?.estimatedMarginPct).toEqual({ min: 50, max: 75 });
    expect(payload.opportunity?.suggestedRetainerUsd).toBe(4000);
  });

  it("каждое предложенное действие несёт непустую причину", async () => {
    const report = await caller(agencyId).reports.generateOpportunity({ clientId });
    const payload = reportPayloadSchema.parse(report.payload);

    for (const action of payload.opportunity?.rankedActions ?? []) {
      expect(action.reason.trim().length).toBeGreaterThan(0);
    }
    expect(payload.opportunity?.rankedActions.length).toBeLessThanOrEqual(20);
  });

  it("оговорки аудита стоят в отчёте", async () => {
    const report = await caller(agencyId).reports.generateOpportunity({ clientId });
    const payload = reportPayloadSchema.parse(report.payload);

    expect(payload.caveats).toContain(REPORT_COPY.opportunityBasis);
    expect(payload.caveats).toContain(REPORT_COPY.scopeEstimate);
    expect(payload.caveats).toContain(REPORT_COPY.measurementBasis);
  });

  it("перевёрнутый диапазон часов не создаёт отчёт", async () => {
    await expect(
      caller(agencyId).reports.generateOpportunity({
        clientId,
        effortHoursMin: 20,
        effortHoursMax: 5,
      }),
    ).rejects.toThrow();
  });

  it("чужой клиент неотличим от несуществующего", async () => {
    const other = await createAgency(db, { name: "Other", clientLimit: 10 });
    try {
      await expect(
        caller(other.id).reports.generateOpportunity({ clientId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await deleteAgency(db, other.id);
    }
  });
});
