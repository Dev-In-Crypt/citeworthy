import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function main(): Promise<void> {
  const hasMigrations =
    existsSync(migrationsFolder) && readdirSync(migrationsFolder).some((f) => f.endsWith(".sql"));

  if (!hasMigrations) {
    console.log("[db] No migrations to apply (schema is empty so far).");
    return;
  }

  const { db, close } = createDb();
  try {
    await migrate(db, { migrationsFolder });
    console.log("[db] Migrations applied.");
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("[db] Migration failed:", error);
  process.exit(1);
});
