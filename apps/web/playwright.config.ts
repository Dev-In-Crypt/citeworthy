import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Прогон идёт по production-сборке: e2e должен ловить то, что уедет в прод.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      // Прогон делает несколько регистраций подряд с одного адреса.
      DISABLE_RATE_LIMIT: "true",
    },
  },
});
