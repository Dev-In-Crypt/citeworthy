/**
 * @repo/db — Drizzle-схема и миграции. Единственное место определения таблиц.
 */

export { createDb, type Database } from "./client.js";
export { requireEnv, optionalEnv } from "./env.js";
export * from "./schema/index.js";
