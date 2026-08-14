import { z } from "zod";

/** Контракт C1 (TASKS.md). Менять только осознанно, с обновлением TASKS.md. */

export type Platform = "chatgpt" | "perplexity" | "gemini";

export const PLATFORMS: readonly Platform[] = ["chatgpt", "perplexity", "gemini"] as const;

export interface Citation {
  url: string;
  title?: string;
}

export interface AdapterResult {
  text: string;
  citations: Citation[];
  modelVersion: string;
  costUsd: number;
  latencyMs: number;
}

export interface AdapterOptions {
  geo?: string;
  lang?: string;
  /**
   * Номер сэмпла. Живые адаптеры его игнорируют — ассистент и так отвечает
   * каждый раз по-своему. Фикстурам он нужен, чтобы повторные сэмплы одного
   * вопроса различались: иначе доля в mock-режиме может быть только 0% или
   * 100%, и весь смысл повторных замеров пропадает ещё до продакшена.
   */
  sampleIndex?: number;
}

export interface PlatformAdapter {
  platform: Platform;
  execute(prompt: string, opts?: AdapterOptions): Promise<AdapterResult>;
}

/** Рантайм-проверка формы ответа адаптера: живые API меняются без предупреждения. */
export const citationSchema = z.object({
  url: z.url(),
  title: z.string().optional(),
});

export const adapterResultSchema = z.object({
  text: z.string().min(1),
  citations: z.array(citationSchema),
  modelVersion: z.string().min(1),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
});
