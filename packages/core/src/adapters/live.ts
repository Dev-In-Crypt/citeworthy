import { registerLiveAdapter } from "./registry";
import { OpenAiAdapter } from "./openai";

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
    registerLiveAdapter(
      "chatgpt",
      () => new OpenAiAdapter({ apiKey: openAiKey, ...(model ? { model } : {}) }),
    );
    registered.push("chatgpt");
  }

  // perplexity и gemini подключатся здесь же — T14 и T15.

  return registered;
}
