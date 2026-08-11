/**
 * @repo/core — чистая бизнес-логика без I/O-фреймворков.
 * Здесь живут контракты C1–C6 (см. TASKS.md): адаптеры платформ, парсинг ответов,
 * метрики visibility, experiment math, схема отчёта, copy-константы.
 */

export const CORE_PACKAGE_NAME = "@repo/core";

export * from "./adapters/types";
export { MockAdapter, stableHash } from "./adapters/mock";
export {
  getAdapter,
  getAdapters,
  isPlatform,
  parseAdaptersMode,
  registerLiveAdapter,
  type AdaptersMode,
} from "./adapters/registry";
export { RESPONSE_FIXTURES, fixturesForPlatform } from "./fixtures/responses";
export type { ResponseFixture } from "./fixtures/responses";
export * from "./storage/types";
