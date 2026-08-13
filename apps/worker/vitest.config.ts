import { defineConfig } from "vitest/config";
// Побочный импорт: он же загружает корневой .env — dotenv лежит в @repo/db.
import "../../packages/db/src/env";
import { testDatabaseUrl } from "../../packages/db/src/test-database";

/** База отдельная от рабочей: тесты стирают глобальные таблицы. */
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl(process.env["DATABASE_URL"] ?? ""),
    },
  },
});
