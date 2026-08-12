import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/db"],
  typedRoutes: true,
  // Playwright запускает настоящий браузер и не должен попадать в бандл.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Иначе Next выбирает корнем чужой package-lock.json выше по дереву.
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
};

export default nextConfig;
