import { registerLiveAdapter } from "./registry";
import { OpenAiAdapter } from "./openai";
import type { ReasoningEffort } from "./openai";
import { PerplexityAdapter } from "./perplexity";
import { GeminiAdapter } from "./gemini";
import { ClaudeAdapter } from "./claude";
import { GrokAdapter } from "./grok";

/**
 * Подключение живых адаптеров.
 *
 * Вызывается приложениями явно, а не при импорте пакета: импорт `@repo/core`
 * не должен сам по себе означать готовность ходить в сеть и тратить деньги.
 * Платформа без ключа просто не регистрируется — прогон по ней упадёт с
 * понятной ошибкой из реестра, а не молча отдаст пустое измерение.
 */
export function registerLiveAdapters(env: NodeJS.ProcessEnv = process.env): string[] {
  const registered: string[] = [];

  const openAiKey = env["OPENAI_API_KEY"]?.trim();
  if (openAiKey) {
    const model = env["OPENAI_MODEL"]?.trim();
    const effort = env["OPENAI_REASONING_EFFORT"]?.trim() as ReasoningEffort | undefined;
    registerLiveAdapter(
      "chatgpt",
      () =>
        new OpenAiAdapter({
          apiKey: openAiKey,
          ...(model ? { model } : {}),
          ...(effort ? { reasoningEffort: effort } : {}),
        }),
    );
    registered.push("chatgpt");
  }

  const perplexityKey = env["PERPLEXITY_API_KEY"]?.trim();
  if (perplexityKey) {
    const model = env["PERPLEXITY_MODEL"]?.trim();
    const endpoint = env["PERPLEXITY_ENDPOINT"]?.trim();
    registerLiveAdapter(
      "perplexity",
      () =>
        new PerplexityAdapter({
          apiKey: perplexityKey,
          ...(model ? { model } : {}),
          ...(endpoint ? { endpoint } : {}),
        }),
    );
    registered.push("perplexity");
  }

  const geminiKey = env["GEMINI_API_KEY"]?.trim();
  if (geminiKey) {
    const model = env["GEMINI_MODEL"]?.trim();
    const endpoint = env["GEMINI_ENDPOINT"]?.trim();
    registerLiveAdapter(
      "gemini",
      () =>
        new GeminiAdapter({
          apiKey: geminiKey,
          ...(model ? { model } : {}),
          ...(endpoint ? { endpoint } : {}),
        }),
    );
    registered.push("gemini");
  }

  const claudeKey = env["ANTHROPIC_API_KEY"]?.trim();
  if (claudeKey) {
    const model = env["CLAUDE_MODEL"]?.trim();
    const endpoint = env["CLAUDE_ENDPOINT"]?.trim();
    const searchTool = env["CLAUDE_SEARCH_TOOL"]?.trim();
    const maxSearches = Number(env["CLAUDE_MAX_SEARCHES"]);
    registerLiveAdapter(
      "claude",
      () =>
        new ClaudeAdapter({
          apiKey: claudeKey,
          ...(model ? { model } : {}),
          ...(endpoint ? { endpoint } : {}),
          ...(searchTool ? { searchTool } : {}),
          ...(Number.isInteger(maxSearches) && maxSearches > 0 ? { maxSearches } : {}),
        }),
    );
    registered.push("claude");
  }

  const grokKey = env["XAI_API_KEY"]?.trim();
  if (grokKey) {
    const model = env["GROK_MODEL"]?.trim();
    const endpoint = env["GROK_ENDPOINT"]?.trim();
    registerLiveAdapter(
      "grok",
      () =>
        new GrokAdapter({
          apiKey: grokKey,
          ...(model ? { model } : {}),
          ...(endpoint ? { endpoint } : {}),
        }),
    );
    registered.push("grok");
  }

  return registered;
}
