import { registerLiveAdapter } from "./registry";
import { OpenAiAdapter } from "./openai";
import type { ReasoningEffort } from "./openai";
import { PerplexityAdapter } from "./perplexity";
import { GeminiAdapter } from "./gemini";

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

  return registered;
}
