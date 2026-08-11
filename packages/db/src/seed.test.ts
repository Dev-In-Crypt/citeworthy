import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import {
  SEED_AGENCY_ID,
  SEED_CLIENT_ACME_ID,
  SEED_OWNER_EMAIL,
  SEED_OWNER_ID,
  seed,
} from "./seed";
import { agencies, clients, users } from "./schema/tenancy";
import { promptClusters, prompts, runSchedules } from "./schema/measurement";
import { SEED_CLUSTER_COMPARISON_ID, SEED_SCHEDULE_ID } from "./seed";
import type { Database } from "./client";
// Типы схемы должны быть доступны через публичный вход пакета (verify T10).
import type { NewPrompt, Prompt, Response, Run } from "./index";

/**
 * Интеграционный тест: требует поднятой БД (`docker compose up -d && pnpm db:migrate`).
 * Проверяет содержимое seed и его идемпотентность.
 */
describe("seed", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const connection = createDb();
    db = connection.db;
    close = connection.close;
    // Прогоняем дважды — идемпотентность должна выполняться на грязной БД.
    await seed(db);
    await seed(db);
  });

  afterAll(async () => {
    await close();
  });

  it("создаёт ровно одно агентство", async () => {
    const rows = await db.select().from(agencies).where(eq(agencies.id, SEED_AGENCY_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Demo Agency");
    expect(rows[0]?.clientLimit).toBe(10);
  });

  it("создаёт ровно одного owner'а", async () => {
    const rows = await db.select().from(users).where(eq(users.id, SEED_OWNER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(SEED_OWNER_EMAIL);
    expect(rows[0]?.role).toBe("owner");
    expect(rows[0]?.agencyId).toBe(SEED_AGENCY_ID);
  });

  it("создаёт ровно двух клиентов агентства, без дублей после повторного прогона", async () => {
    const rows = await db.select().from(clients).where(eq(clients.agencyId, SEED_AGENCY_ID));
    expect(rows).toHaveLength(2);
  });

  it("создаёт 2 кластера и 10 промптов без дублей после повторного прогона", async () => {
    const clusters = await db
      .select()
      .from(promptClusters)
      .where(eq(promptClusters.clientId, SEED_CLIENT_ACME_ID));
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.intent).sort()).toEqual(["comparison", "learning"]);

    const allPrompts = await db.select().from(prompts);
    expect(allPrompts).toHaveLength(10);
  });

  it("в каждом кластере есть контрольный промпт — база сравнения для экспериментов", async () => {
    const comparison = await db
      .select()
      .from(prompts)
      .where(eq(prompts.clusterId, SEED_CLUSTER_COMPARISON_ID));

    expect(comparison).toHaveLength(5);
    expect(comparison.filter((p) => p.isControl)).toHaveLength(1);
  });

  it("расписание задаёт три платформы и повторные сэмплы", async () => {
    const rows = await db.select().from(runSchedules).where(eq(runSchedules.id, SEED_SCHEDULE_ID));
    const schedule = rows[0];

    expect(schedule?.platforms).toEqual(["chatgpt", "perplexity", "gemini"]);
    // Контракт C3: visibility считается по доле, поэтому сэмплов минимум 3.
    expect(schedule?.samplesPerPrompt).toBeGreaterThanOrEqual(3);
  });

  it("типы схемы экспортированы из входа пакета", () => {
    // Проверка компилируемости: если экспорт пропадёт, typecheck упадёт.
    const prompt: NewPrompt = { clusterId: SEED_CLUSTER_COMPARISON_ID, text: "type check" };
    const asSelect: Pick<Prompt, "text"> = { text: prompt.text };
    const run: Pick<Run, "status"> = { status: "pending" };
    const response: Pick<Response, "platform"> = { platform: "chatgpt" };

    expect([asSelect.text, run.status, response.platform]).toEqual([
      "type check",
      "pending",
      "chatgpt",
    ]);
  });

  it("сохраняет brand_names и competitor_names как массивы", async () => {
    const rows = await db.select().from(clients).where(eq(clients.id, SEED_CLIENT_ACME_ID));
    const acme = rows[0];
    expect(acme?.brandNames).toEqual(["AcmeCRM", "Acme CRM", "Acme"]);
    expect(acme?.competitorNames).toContain("HubSpot");
  });
});
