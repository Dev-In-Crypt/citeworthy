import { defineConfig } from "vitest/config";
// Побочный импорт: он же загружает корневой .env — dotenv лежит в @repo/db.
import "../db/src/env";
import { testDatabaseUrl } from "../db/src/test-database";

export default defineConfig({
  test: {
    environment: "node",
    /**
     * Файлы гоняются последовательно: это интеграционные тесты над одной БД,
     * и часть из них чистит глобальную таблицу `sources` (она намеренно
     * не привязана к агентству). При параллельном запуске один файл удаляет
     * источники, пока другой их читает — падения выглядят как ошибки в коде,
     * хотя проблема в изоляции тестов.
     *
     * База при этом отдельная от рабочей (см. globalSetup): стирать в ней
     * можно что угодно, рабочие данные это не заденет.
     */
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl(process.env["DATABASE_URL"] ?? ""),
    },
  },
});
