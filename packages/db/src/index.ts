/**
 * @repo/db — Drizzle-схема и миграции. Единственное место определения таблиц.
 */

export { createDb, type Database } from "./client";
export { requireEnv, optionalEnv } from "./env";
export * from "./schema/index";
