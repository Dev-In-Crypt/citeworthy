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
    /**
     * Лимит на один тест — 30 секунд вместо умолчания в пять.
     *
     * Пять секунд — умолчание для юнит-тестов, а здесь каждый тест
     * поднимает агентство, клиента, прогон и десятки ответов в настоящей
     * базе. Самые тяжёлые подходили к пяти секундам вплотную и падали на
     * машине под нагрузкой — падение выглядело как ошибка в коде, хотя
     * означало только «сегодня медленно». Лимит ниже реального времени
     * теста не защищает ни от чего.
     */
    testTimeout: 30_000,
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl(process.env["DATABASE_URL"] ?? ""),
    },
  },
});
