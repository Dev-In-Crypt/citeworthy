import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/db"],
  typedRoutes: true,
  /**
   * Сборка со своим минимальным node_modules — только в образе.
   *
   * Standalone-вывод раскладывается симлинками, а Windows их без прав
   * разработчика не создаёт: включённый постоянно, он ломает локальную
   * сборку у всех, кто работает не на Linux. В Dockerfile переменная задана.
   */
  ...(process.env["DOCKER_BUILD"] === "1" ? { output: "standalone" as const } : {}),
  // Playwright запускает настоящий браузер и не должен попадать в бандл.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Иначе Next выбирает корнем чужой package-lock.json выше по дереву.
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
};

export default nextConfig;
