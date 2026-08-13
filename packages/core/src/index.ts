/**
 * @repo/core — чистая бизнес-логика без I/O-фреймворков.
 * Здесь живут контракты C1–C6 (см. TASKS.md): адаптеры платформ, парсинг ответов,
 * метрики visibility, experiment math, схема отчёта, copy-константы.
 */

export const CORE_PACKAGE_NAME = "@repo/core";

export * from "./adapters/types";
export { MockAdapter, stableHash } from "./adapters/mock";
export {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_REASONING_EFFORT,
  OpenAiAdapter,
  OPENAI_PRICING,
  openAiCostUsd,
} from "./adapters/openai";
export type { OpenAiAdapterConfig, OpenAiPricing, ReasoningEffort } from "./adapters/openai";
export {
  DEFAULT_PERPLEXITY_ENDPOINT,
  DEFAULT_PERPLEXITY_MODEL,
  PerplexityAdapter,
  PERPLEXITY_PRICING,
  perplexityCostUsd,
} from "./adapters/perplexity";
export type { PerplexityAdapterConfig, PerplexityPricing } from "./adapters/perplexity";
export {
  DEFAULT_GEMINI_ENDPOINT,
  DEFAULT_GEMINI_MODEL,
  GeminiAdapter,
  GEMINI_PRICING,
  geminiCostUsd,
} from "./adapters/gemini";
export type { GeminiAdapterConfig, GeminiPricing } from "./adapters/gemini";
export { registerLiveAdapters } from "./adapters/live";
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
export * from "./fixtures/sample-report";
export * from "./storage/types";
export * from "./parsing/types";
export { findAlias, matchEntities, mentionsFromText } from "./parsing/matcher";
export { domainOf, mergeMentions, parseResponse } from "./parsing/parse";
export * from "./metrics/visibility";
export * from "./billing/period";
export * from "./billing/cost";
export * from "./import/csv";
export * from "./prompts/generate";
export * from "./parsing/highlight";
export * from "./sources/domains";
export * from "./sources/classifier";
export * from "./diagnosis/source-graph";
export * from "./copy";
export * from "./diagnosis/recommendations";
export * from "./execution/playbooks";
export * from "./execution/brief";
export * from "./execution/outcome";
export * from "./experiments/baseline";
export * from "./experiments/events";
export * from "./experiments/math";
export * from "./reports/schema";
export * from "./reports/build";
export * from "./reports/opportunity";
export * from "./observability/logger";
export * from "./observability/errors";
