import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { adminDatabaseUrl, databaseNameOf, testDatabaseUrl } from "./test-database";

/**
 * Готовит тестовую базу перед прогоном: создаёт, если её нет, и накатывает
 * миграции. Запускается один раз на пакет через globalSetup.
 */

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

export async function prepareTestDatabase(): Promise<void> {
  const base = process.env["DATABASE_URL"];
  if (!base) {
    throw new Error("DATABASE_URL is not set — tests need it to derive the test database.");
  }

  const url = testDatabaseUrl(base);
  const name = databaseNameOf(url);

  const admin = postgres(adminDatabaseUrl(base), { max: 1 });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) {
      // Имя подставляется небезопасным способом, потому что параметры в
      // CREATE DATABASE не поддерживаются; оно выведено из нашего же адреса.
      await admin.unsafe(`create database "${name}"`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
