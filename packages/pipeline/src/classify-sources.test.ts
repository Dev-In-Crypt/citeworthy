import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgency,
  createClient,
  createDb,
  createRun,
  deleteAgency,
  ensureSource,
  getSourceByDomain,
  listUnclassifiedSources,
} from "@repo/db";
import { promptClusters, prompts, runSchedules } from "@repo/db/schema/measurement";
import { orchestrateRun } from "./run-orchestration";
import { classifyRunSources } from "./classify-sources";

/** Verify T30 на стороне БД: домены цитат заводятся и классифицируются правилами. */

const { db, close } = createDb();

describe("classifyRunSources", () => {
  let agencyId = "";
  let runId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Sources Agency", clientLimit: 10 });
    agencyId = agency.id;

    const client = await createClient(db, {
      agencyId,
      // Домен клиента совпадает с доменом в fixture-цитатах: проверяем owned.
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

    await db.insert(prompts).values([{ clusterId, text: "best CRM for startups" }]);

    const scheduleId = (
      await db
        .insert(runSchedules)
        .values({ clientId: client.id, platforms: ["chatgpt"], samplesPerPrompt: 1 })
        .returning()
    )[0]!.id;

    runId = (await createRun(db, { clientId: client.id, scheduleId, trigger: "manual" })).id;
    await orchestrateRun(db, runId, "mock");
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  afterAll(async () => {
    await close();
  });

  it("заводит источники по процитированным доменам", async () => {
    const outcome = await classifyRunSources(db, runId);

    expect(outcome.domains).toBeGreaterThan(0);
    expect(await getSourceByDomain(db, "g2.com")).toBeDefined();
  });

  it("известные домены классифицируются правилом", async () => {
    await classifyRunSources(db, runId);

    const g2 = await getSourceByDomain(db, "g2.com");
    expect(g2?.sourceType).toBe("review");
    // Видно, чем классифицирован — правилом или моделью.
    expect(g2?.classifiedBy).toBe("rule");
  });

  it("домен клиента становится owned", async () => {
    await classifyRunSources(db, runId);

    const own = await getSourceByDomain(db, "acmecrm.test");
    expect(own?.sourceType).toBe("owned");
  });

  it("неизвестные домены остаются без типа и ждут модель", async () => {
    const outcome = await classifyRunSources(db, runId);
    const unclassified = await listUnclassifiedSources(db);

    // blog.hubspot.com словарём не покрыт — он должен ждать классификации,
    // а не быть молча записанным в "other".
    expect(outcome.awaitingModel).toBeGreaterThan(0);
    expect(unclassified.some((s) => s.domain === "blog.hubspot.com")).toBe(true);
  });

  it("повторная классификация не плодит источники", async () => {
    const first = await classifyRunSources(db, runId);
    const second = await classifyRunSources(db, runId);

    expect(second.domains).toBe(first.domains);
  });

  it("уже классифицированный источник не перезаписывается", async () => {
    await ensureSource(db, "manual-check.example", {
      sourceType: "editorial",
      classifiedBy: "human",
    });

    await ensureSource(db, "manual-check.example", {
      sourceType: "ugc",
      classifiedBy: "rule",
    });

    // Иначе более точная ручная или модельная классификация затиралась бы правилом.
    const source = await getSourceByDomain(db, "manual-check.example");
    expect(source?.sourceType).toBe("editorial");
    expect(source?.classifiedBy).toBe("human");
  });
});
