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

export const SEED_CLIENT_LEDGERBROOK_ID = "00000000-0000-4000-8000-000000000008";
export const SEED_CLUSTER_SPEND_COMPARISON_ID = "00000000-0000-4000-8000-000000000009";
export const SEED_CLUSTER_SPEND_PURCHASE_ID = "00000000-0000-4000-8000-00000000000a";

/**
 * Ledgerbrook — вымышленный клиент из макетов: spend management для
 * среднего бизнеса, конкуренты Outlay, Spendhaven и Tallyard.
 *
 * Имена выдуманы намеренно. Демо-данные с настоящими брендами означали бы
 * отчёт с цифрами видимости компаний, которых мы никогда не измеряли, —
 * а он уходит наружу под логотипом агентства.
 */
const SPEND_COMPARISON_PROMPTS: { text: string; isControl: boolean }[] = [
  { text: "best expense management software for a 300-person company", isControl: false },
  { text: "Ledgerbrook vs Outlay", isControl: false },
  { text: "Outlay alternatives for mid-market finance teams", isControl: false },
  // Контрольный промпт из другой категории: по нему видно фоновый дрейф.
  { text: "best CRM for startups", isControl: true },
];

const SPEND_PURCHASE_PROMPTS: { text: string; isControl: boolean }[] = [
  { text: "corporate card with automated expense reports", isControl: false },
  { text: "spend management that syncs with NetSuite", isControl: false },
  { text: "how to close the books faster at 500 employees", isControl: false },
];

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
      {
        id: SEED_CLIENT_LEDGERBROOK_ID,
        agencyId: SEED_AGENCY_ID,
        name: "Ledgerbrook",
        domain: "ledgerbrook.test",
        industry: "Spend management for mid-market finance teams",
        brandNames: ["Ledgerbrook", "Ledgerbrook Inc", "the Ledgerbrook Card"],
        competitorNames: ["Outlay", "Spendhaven", "Tallyard"],
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
      {
        id: SEED_CLUSTER_SPEND_COMPARISON_ID,
        clientId: SEED_CLIENT_LEDGERBROOK_ID,
        name: "Spend management comparison",
        intent: "comparison",
      },
      {
        id: SEED_CLUSTER_SPEND_PURCHASE_ID,
        clientId: SEED_CLIENT_LEDGERBROOK_ID,
        name: "Buying signals",
        intent: "purchase",
      },
    ])
    .onConflictDoNothing({ target: promptClusters.id });

  /**
   * Промпты без фиксированных id, поэтому пустоту проверяем по каждому
   * кластеру отдельно.
   *
   * Глобальная проверка «в базе вообще нет промптов» здесь стояла раньше и
   * тихо ломалась: стоило появиться любому промпту у любого клиента — и
   * новый кластер оставался пустым навсегда, а seed при этом рапортовал
   * об успехе.
   */
  const seedClusters: [string, { text: string; isControl: boolean }[]][] = [
    [SEED_CLUSTER_COMPARISON_ID, COMPARISON_PROMPTS],
    [SEED_CLUSTER_LEARNING_ID, LEARNING_PROMPTS],
    [SEED_CLUSTER_SPEND_COMPARISON_ID, SPEND_COMPARISON_PROMPTS],
    [SEED_CLUSTER_SPEND_PURCHASE_ID, SPEND_PURCHASE_PROMPTS],
  ];

  for (const [clusterId, texts] of seedClusters) {
    const existing = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(eq(prompts.clusterId, clusterId))
      .limit(1);

    if (existing.length === 0) {
      const rows: NewPrompt[] = texts.map((prompt) => ({ ...prompt, clusterId }));
      await db.insert(prompts).values(rows);
    }
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
