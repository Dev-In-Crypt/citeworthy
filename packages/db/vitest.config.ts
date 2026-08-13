import { defineConfig } from "vitest/config";
// Побочный импорт: он же загружает корневой .env.
import "./src/env";
import { testDatabaseUrl } from "./src/test-database";

/**
 * Тесты работают на отдельной базе: они стирают глобальные таблицы, и на
 * рабочей базе один прогон уносил классификацию источников всех клиентов.
 */
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
