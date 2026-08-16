/**
 * @repo/db — Drizzle-схема и миграции. Единственное место определения таблиц.
 */

export { createDb, type Database } from "./client";
export { requireEnv, optionalEnv } from "./env";
export { testDatabaseUrl } from "./test-database";
export { prepareTestDatabase } from "./test-setup";
export * from "./queries";
export * from "./schema/index";
// Идентификаторы демо-данных: их использует демонстрационный прогон в конвейере.
export { SEED_AGENCY_ID, SEED_CLIENT_ACME_ID, SEED_OWNER_EMAIL, seed } from "./seed";
