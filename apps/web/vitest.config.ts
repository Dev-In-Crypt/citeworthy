import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
// Побочный импорт: он же загружает корневой .env — dotenv лежит в @repo/db.
import "../../packages/db/src/env";
import { testDatabaseUrl } from "../../packages/db/src/test-database";

export default defineConfig({
  resolve: {
    alias: {
      // Плагин vite-tsconfig-paths ESM-only и не грузится загрузчиком конфига vitest 2,
      // поэтому алиас задаётся здесь напрямую (должен совпадать с paths в tsconfig.json).
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // e2e гоняет Playwright, а не vitest
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
    /**
     * Последовательно: это интеграционные тесты над одной БД. При параллельном
     * запуске файлы удаляют агентства друг друга, и падения выглядят как ошибки
     * в коде, хотя проблема в изоляции тестов (та же причина, что в @repo/pipeline).
     */
    fileParallelism: false,
    // База отдельная от рабочей: тесты стирают глобальные таблицы.
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl(process.env["DATABASE_URL"] ?? ""),
    },
  },
});
