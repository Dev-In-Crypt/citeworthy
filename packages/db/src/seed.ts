import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { agencies, clients, users } from "./schema/tenancy";
import { promptClusters, prompts, runSchedules } from "./schema/measurement";
import type { Database } from "./client";
import type { NewPrompt } from "./schema/measurement";

/** Фиксированные идентификаторы делают seed идемпотентным и предсказуемым в тестах. */
export const SEED_AGENCY_ID = "00000000-0000-4000-8000-000000000001";
export const SEED_OWNER_ID = "00000000-0000-4000-8000-000000000002";
export const SEED_CLIENT_ACME_ID = "00000000-0000-4000-8000-000000000003";
export const SEED_CLIENT_NORTHWIND_ID = "00000000-0000-4000-8000-000000000004";

export const SEED_OWNER_EMAIL = "owner@demo-agency.test";

export const SEED_CLUSTER_COMPARISON_ID = "00000000-0000-4000-8000-000000000005";
export const SEED_CLUSTER_LEARNING_ID = "00000000-0000-4000-8000-000000000006";
export const SEED_SCHEDULE_ID = "00000000-0000-4000-8000-000000000007";

/** Промпты кластера сравнения — коммерческий интент, где и решается видимость. */
const COMPARISON_PROMPTS: { text: string; isControl: boolean }[] = [
  { text: "best CRM for startups", isControl: false },
  { text: "HubSpot alternatives", isControl: false },
  { text: "easiest CRM for a small sales team", isControl: false },
  { text: "CRM with an open API", isControl: false },
  // Контрольный промпт: действия по кластеру сравнения его не касаются (см. T43).
  { text: "best project management tool for agencies", isControl: true },
];

const LEARNING_PROMPTS: { text: string; isControl: boolean }[] = [
  { text: "what is a sales CRM", isControl: false },
  { text: "how does CRM pipeline management work", isControl: false },
  { text: "CRM vs spreadsheet for a small team", isControl: false },
  { text: "what to look for when choosing a CRM", isControl: false },
  { text: "what is customer lifecycle management", isControl: true },
];

/**
 * Наполняет БД демо-данными. Идемпотентен: повторный запуск не создаёт дубликатов
 * и приводит записи к эталонному состоянию.
 */
export async function seed(db: Database): Promise<void> {
  await db
    .insert(agencies)
    .values({
      id: SEED_AGENCY_ID,
      name: "Demo Agency",
      brandColor: "#4f46e5",
      plan: "growth",
      clientLimit: 10,
    })
    .onConflictDoUpdate({
      target: agencies.id,
      set: { name: "Demo Agency", plan: "growth", clientLimit: 10 },
    });

  await db
    .insert(users)
    .values({
      id: SEED_OWNER_ID,
      agencyId: SEED_AGENCY_ID,
      email: SEED_OWNER_EMAIL,
      name: "Demo Owner",
      role: "owner",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: SEED_OWNER_EMAIL, name: "Demo Owner", role: "owner" },
    });

  await db
    .insert(clients)
    .values([
      {
        id: SEED_CLIENT_ACME_ID,
        agencyId: SEED_AGENCY_ID,
        name: "AcmeCRM",
        domain: "acmecrm.test",
        industry: "B2B SaaS / CRM",
        brandNames: ["AcmeCRM", "Acme CRM", "Acme"],
        competitorNames: ["HubSpot", "Pipedrive", "Close", "Salesforce"],
        status: "active",
      },
      {
        id: SEED_CLIENT_NORTHWIND_ID,
        agencyId: SEED_AGENCY_ID,
        name: "Northwind Analytics",
        domain: "northwind-analytics.test",
        industry: "B2B SaaS / Analytics",
        brandNames: ["Northwind Analytics", "Northwind"],
        competitorNames: ["Amplitude", "Mixpanel", "Heap"],
        status: "active",
      },
    ])
    .onConflictDoNothing({ target: clients.id });

  await db
    .insert(promptClusters)
    .values([
      {
        id: SEED_CLUSTER_COMPARISON_ID,
        clientId: SEED_CLIENT_ACME_ID,
        name: "CRM comparison",
        intent: "comparison",
      },
      {
        id: SEED_CLUSTER_LEARNING_ID,
        clientId: SEED_CLIENT_ACME_ID,
        name: "CRM basics",
        intent: "learning",
      },
    ])
    .onConflictDoNothing({ target: promptClusters.id });

  // Промпты без фиксированных id: вставляем только если кластер пуст,
  // иначе повторный прогон seed создал бы дубликаты.
  const existingPrompts = await db.select({ id: prompts.id }).from(prompts);
  if (existingPrompts.length === 0) {
    const rows: NewPrompt[] = [
      ...COMPARISON_PROMPTS.map((p) => ({ ...p, clusterId: SEED_CLUSTER_COMPARISON_ID })),
      ...LEARNING_PROMPTS.map((p) => ({ ...p, clusterId: SEED_CLUSTER_LEARNING_ID })),
    ];
    await db.insert(prompts).values(rows);
  }

  await db
    .insert(runSchedules)
    .values({
      id: SEED_SCHEDULE_ID,
      clientId: SEED_CLIENT_ACME_ID,
      cadence: "weekly",
      platforms: ["chatgpt", "perplexity", "gemini"],
      samplesPerPrompt: 3,
    })
    .onConflictDoNothing({ target: runSchedules.id });
}

async function main(): Promise<void> {
  const { db, close } = createDb();
  try {
    await seed(db);
    const rows = await db.select().from(clients).where(eq(clients.agencyId, SEED_AGENCY_ID));
    console.log(`[db] Seed applied: 1 agency, 1 owner, ${rows.length} clients.`);
  } finally {
    await close();
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/seed.ts") ?? false;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("[db] Seed failed:", error);
    process.exit(1);
  });
}
