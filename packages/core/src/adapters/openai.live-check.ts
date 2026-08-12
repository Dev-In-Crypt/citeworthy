import { getAdapter, parseAdaptersMode } from "./registry";
import { registerLiveAdapters } from "./live";

/**
 * Ручная проверка живого адаптера: единственное место в репозитории, которое
 * действительно ходит в сеть и тратит деньги. Не тест — тесты сеть не трогают.
 *
 * Запуск: ADAPTERS_MODE=live pnpm --filter @repo/core exec tsx src/adapters/openai.live-check.ts "best CRM for startups"
 */
async function main(): Promise<void> {
  const mode = parseAdaptersMode(process.env["ADAPTERS_MODE"]);
  if (mode !== "live") {
    throw new Error("Set ADAPTERS_MODE=live to run this check.");
  }

  const registered = registerLiveAdapters();
  if (!registered.includes("chatgpt")) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const prompt = process.argv[2] ?? "best CRM for startups";
  const adapter = getAdapter("chatgpt", "live");
  const result = await adapter.execute(prompt);

  console.log(JSON.stringify({
    prompt,
    modelVersion: result.modelVersion,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    citations: result.citations.length,
    domains: [...new Set(result.citations.map((c) => new URL(c.url).hostname))],
    textHead: result.text.slice(0, 200),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
