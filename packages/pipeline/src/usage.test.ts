import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { billingPeriod } from "@repo/core";
import {
  createAgency,
  createClient,
  createDb,
  createRun,
  deleteAgency,
  getUsageCounter,
  incrementAiChecks,
} from "@repo/db";
import { promptClusters, prompts, runSchedules } from "@repo/db/schema/measurement";
import { orchestrateRun } from "./run-orchestration";

/** Verify T20: прогон из T17 (18 ответов) увеличивает счётчик ровно на 18. */

const { db, close } = createDb();

describe("usage counters", () => {
  let agencyId = "";
  let runId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Usage Agency", clientLimit: 10 });
    agencyId = agency.id;

    const client = await createClient(db, {
      agencyId,
      name: "AcmeCRM",
      domain: "acmecrm.test",
      brandNames: ["AcmeCRM"],
      competitorNames: ["HubSpot"],
    });

    const clusterId = (
      await db
        .insert(promptClusters)
        .values({ clientId: client.id, name: "c", intent: "comparison" })
        .returning()
    )[0]!.id;

    await db.insert(prompts).values([
      { clusterId, text: "best CRM for startups" },
      { clusterId, text: "HubSpot alternatives" },
    ]);

    const scheduleId = (
      await db
        .insert(runSchedules)
        .values({
          clientId: client.id,
          platforms: ["chatgpt", "perplexity", "gemini"],
          samplesPerPrompt: 3,
        })
        .returning()
    )[0]!.id;

    runId = (await createRun(db, { clientId: client.id, scheduleId, trigger: "manual" })).id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  afterAll(async () => {
    await close();
  });

  it("прогон на 18 ответов увеличивает счётчик ровно на 18", async () => {
    await orchestrateRun(db, runId, "mock");

    const counter = await getUsageCounter(db, agencyId, billingPeriod());
    expect(counter?.aiChecksUsed).toBe(18);
  });

  it("инкремент атомарен при параллельных вызовах", async () => {
    const period = billingPeriod();
    // Job'ы платформ выполняются параллельно и пишут в одну строку:
    // без атомарного инкремента часть расхода терялась бы.
    await Promise.all(Array.from({ length: 20 }, () => incrementAiChecks(db, agencyId, period)));

    expect((await getUsageCounter(db, agencyId, period))?.aiChecksUsed).toBe(20);
  });

  it("расход разных периодов не смешивается", async () => {
    await incrementAiChecks(db, agencyId, "2026-07", 5);
    await incrementAiChecks(db, agencyId, "2026-08", 3);

    expect((await getUsageCounter(db, agencyId, "2026-07"))?.aiChecksUsed).toBe(5);
    expect((await getUsageCounter(db, agencyId, "2026-08"))?.aiChecksUsed).toBe(3);
  });

  it("расход одного агентства не попадает другому", async () => {
    const other = await createAgency(db, { name: "Other Agency" });
    await orchestrateRun(db, runId, "mock");

    expect(await getUsageCounter(db, other.id, billingPeriod())).toBeUndefined();
    await deleteAgency(db, other.id);
  });
});
