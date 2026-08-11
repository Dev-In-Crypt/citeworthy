import { sql } from "drizzle-orm";
import { createDb } from "./client";

/** Проверка живого соединения с БД — используется в verify T01 и в CI. */
async function main(): Promise<void> {
  const { db, close } = createDb();
  try {
    const rows = await db.execute(sql`select 1 as ok`);
    const ok = (rows as unknown as { ok: number }[])[0]?.ok;
    if (ok !== 1) {
      throw new Error(`Unexpected result from database: ${JSON.stringify(rows)}`);
    }
    console.log("[db] Connection OK.");
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("[db] Connection check failed:", error);
  process.exit(1);
});
