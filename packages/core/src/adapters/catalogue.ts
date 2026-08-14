import type { Platform } from "./types";

/**
 * Каталог ассистентов для интерфейса.
 *
 * Продукт обещает видимость «в ответах ИИ», а покупатель под этим понимает
 * не три системы, а весь набор, которым пользуются его клиенты. Каталог
 * перечисляет их целиком и честно помечает, какие мы действительно
 * спрашиваем: у Copilot и AI Overviews публичного API нет вовсе, у Claude и
 * Grok он есть, но адаптера пока нет.
 *
 * Это исключительно про отображение. `PLATFORMS` в `types.ts` — контракт C1,
 * по нему живут enum в БД, расписания и прогоны, и он остаётся тем же.
 * Неизмеряемый ассистент не может попасть ни в один знаменатель просто
 * потому, что по нему нет ни одного ответа.
 */

export interface Assistant {
  id: string;
  /** Полное имя — в подписях и легендах. */
  label: string;
  /** Короткое — в шапке матрицы, где на столбец приходится десяток пикселей. */
  short: string;
  /** Спрашиваем ли мы его на самом деле. */
  measurable: boolean;
}

export const ASSISTANTS: readonly Assistant[] = [
  { id: "chatgpt", label: "ChatGPT", short: "GPT", measurable: true },
  { id: "perplexity", label: "Perplexity", short: "Pplx", measurable: true },
  { id: "gemini", label: "Gemini", short: "Gemini", measurable: true },
  { id: "claude", label: "Claude", short: "Claude", measurable: false },
  { id: "copilot", label: "Copilot", short: "Copilot", measurable: false },
  { id: "ai-overviews", label: "AI Overviews", short: "AIO", measurable: false },
  { id: "grok", label: "Grok", short: "Grok", measurable: false },
] as const;

/** Ассистенты, по которым есть измерения. Совпадает с `PLATFORMS` по составу. */
export function measurableAssistants(): Assistant[] {
  return ASSISTANTS.filter((assistant) => assistant.measurable);
}

export function isMeasurableAssistant(id: string): id is Platform {
  return ASSISTANTS.some((assistant) => assistant.id === id && assistant.measurable);
}
