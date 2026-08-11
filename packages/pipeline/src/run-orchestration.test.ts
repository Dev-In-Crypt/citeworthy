import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgency,
  createClient,
  createDb,
  createRun,
  deleteAgency,
  listResponsesByRun,
} from "@repo/db";
import { promptClusters, prompts, runSchedules } from "@repo/db/schema/measurement";
import { orchestrateRun, planRunJobs } from "./run-orchestration";

/** Verify T17: 2 промпта × 3 платформы × 3 сэмпла = ровно 18 ответов, run.status=done. */

const { db, close } = createDb();

describe("planRunJobs", () => {
  const twoPrompts = [
    { id: "p1", text: "best CRM for startups" },
    { id: "p2", text: "HubSpot alternatives" },
  ];

  it("раскладывает прогон в промпт × платформа × сэмпл", () => {
    const jobs = planRunJobs("run-1", twoPrompts, ["chatgpt", "perplexity", "gemini"], 3);
    expect(jobs).toHaveLength(18);
  });

  it("каждая тройка (промпт, платформа, сэмпл) встречается ровно один раз", () => {
    const jobs = planRunJobs("run-1", twoPrompts, ["chatgpt", "perplexity"], 2);
    const keys = jobs.map((j) => `${j.promptId}|${j.platform}|${j.sampleIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("пустой список промптов даёт пустой план, а не падение", () => {
    expect(planRunJobs("run-1", [], ["chatgpt"], 3)).toHaveLength(0);
  });

  it("нулевое число сэмплов отвергается — это молча сломало бы измерение", () => {
    expect(() => planRunJobs("run-1", twoPrompts, ["chatgpt"], 0)).toThrow(/samplesPerPrompt/);
  });
});

describe("orchestrateRun (mock-режим)", () => {
  let agencyId = "";
  let clientId = "";
  let scheduleId = "";
  let runId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Run Agency", clientLimit: 10 });
    agencyId = agency.id;
    const client = await createClient(db, {
      agencyId,
      name: "AcmeCRM",
      domain: "acmecrm.test",
      brandNames: ["AcmeCRM", "Acme CRM"],
      competitorNames: ["HubSpot", "Pipedrive"],
    });
    clientId = client.id;

    const cluster = (
      await db
        .insert(promptClusters)
        .values({ clientId, name: "CRM comparison", intent: "comparison" })
        .returning()
    )[0]!;

    await db.insert(prompts).values([
      { clusterId: cluster.id, text: "best CRM for startups" },
      { clusterId: cluster.id, text: "HubSpot alternatives" },
    ]);

    scheduleId = (
      await db
        .insert(runSchedules)
        .values({
          clientId,
          cadence: "weekly",
          platforms: ["chatgpt", "perplexity", "gemini"],
          samplesPerPrompt: 3,
        })
        .returning()
    )[0]!.id;

    runId = (await createRun(db, { clientId, scheduleId, trigger: "manual" })).id;
  });

  afterEach(async () => {
    // Тесты делят одну БД: за собой нужно убирать, иначе чужие проверки
    // начнут зависеть от порядка запуска.
    await deleteAgency(db, agencyId);
  });

  afterAll(async () => {
    await close();
  });

  it("2 промпта × 3 платформы × 3 сэмпла дают ровно 18 ответов и статус done", async () => {
    const outcome = await orchestrateRun(db, runId, "mock");

    expect(outcome.expected).toBe(18);
    expect(outcome.written).toBe(18);
    expect(outcome.failed).toBe(0);
    expect(outcome.status).toBe("done");

    const written = await listResponsesByRun(db, runId);
    expect(written).toHaveLength(18);
  });

  it("на каждом ответе есть версия модели и стоимость", async () => {
    await orchestrateRun(db, runId, "mock");
    const written = await listResponsesByRun(db, runId);

    for (const response of written) {
      // Инвариант 6: без model_version история измерений несравнима между собой.
      expect(response.modelVersion).not.toBe("");
      expect(Number(response.costUsd)).toBeGreaterThan(0);
      expect(response.rawText.length).toBeGreaterThan(0);
    }
  });

  it("сырой ответ уходит в storage — переобработка парсером возможна", async () => {
    await orchestrateRun(db, runId, "mock");
    const written = await listResponsesByRun(db, runId);

    for (const response of written) {
      expect(response.rawStorageKey).toMatch(new RegExp(`^runs/${runId}/`));
    }
  });

  it("сэмплы одного промпта покрывают все три платформы", async () => {
    await orchestrateRun(db, runId, "mock");
    const written = await listResponsesByRun(db, runId);

    const platforms = new Set(written.map((r) => r.platform));
    expect([...platforms].sort()).toEqual(["chatgpt", "gemini", "perplexity"]);

    const perPlatform = written.filter((r) => r.platform === "chatgpt");
    expect(perPlatform).toHaveLength(6); // 2 промпта × 3 сэмпла
  });

  it("повторная оркестрация того же прогона не удваивает ответы", async () => {
    await orchestrateRun(db, runId, "mock");
    const second = await orchestrateRun(db, runId, "mock");

    // Уникальный индекс (run, prompt, platform, sample) не даёт записать дубль;
    // прогон честно помечается failed, а не рапортует об успехе.
    expect(second.failed).toBe(18);
    expect(second.status).toBe("failed");
    expect(await listResponsesByRun(db, runId)).toHaveLength(18);
  });
});
