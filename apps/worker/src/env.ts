import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** .env лежит в корне монорепо, а воркер запускается из своей папки. */
function loadRootEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  config();
}

loadRootEnv();

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
export const ADAPTERS_MODE_RAW = process.env.ADAPTERS_MODE;
export const NODE_ENV = process.env.NODE_ENV ?? "development";
/** Пусто — ошибки идут только в лог; это рабочий режим, а не поломка. */
export const SENTRY_DSN = process.env.SENTRY_DSN?.trim() || undefined;
