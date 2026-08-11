import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
  },
});
