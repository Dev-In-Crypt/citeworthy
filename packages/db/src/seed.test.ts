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
import type { Database } from "./client";

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

  it("сохраняет brand_names и competitor_names как массивы", async () => {
    const rows = await db.select().from(clients).where(eq(clients.id, SEED_CLIENT_ACME_ID));
    const acme = rows[0];
    expect(acme?.brandNames).toEqual(["AcmeCRM", "Acme CRM", "Acme"]);
    expect(acme?.competitorNames).toContain("HubSpot");
  });
});
