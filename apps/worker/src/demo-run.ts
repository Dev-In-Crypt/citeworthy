import "./env";
import { createDb, createRun, listClientsByAgency } from "@repo/db";
import { SEED_AGENCY_ID } from "@repo/db/seed";
import { completeRun } from "@repo/pipeline";

/**
 * Прогон на фикстурах для демо-клиентов.
 *
 * Нужен, чтобы локально экраны были не пустыми: матрица, диагностика и
 * портфель читают ответы, а без единого прогона показывают честные, но
 * бесполезные прочерки.
 *
 * Только режим mock: демо-данные не должны стоить денег, а прогоны на
 * фикстурах помечаются в базе и не попадают ни в измерения, ни в расходы.
 */
async function main(): Promise<void> {
  const { db, close } = createDb();

  try {
    const clients = await listClientsByAgency(db, SEED_AGENCY_ID);

    for (const client of clients) {
      const run = await createRun(db, {
        clientId: client.id,
        status: "pending",
        trigger: "manual",
        adaptersMode: "mock",
      });

      // completeRun сам прогоняет, разбирает, классифицирует источники
      // и пересчитывает срезы — то же, что делает воркер по расписанию.
      const outcome = await completeRun(db, run.id, client.id, "mock");

      console.log(
        outcome.responses === 0
          ? `[demo] ${client.name}: no active prompts, nothing measured`
          : `[demo] ${client.name}: ${outcome.responses} answers, ${outcome.snapshots} snapshots`,
      );
    }
  } finally {
    await close();
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/demo-run.ts") ?? false;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("[demo] Failed:", error);
    process.exit(1);
  });
}
