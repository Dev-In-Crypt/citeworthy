import { MIN_SAMPLES_PER_CELL } from "./visibility";

/**
 * Уверенность в цифре — функция только от числа ответов, на которых она
 * посчитана.
 *
 * Одно определение на весь продукт: матрица, портфель и отчёт должны называть
 * одну и ту же выборку одинаково. Разные пороги на разных экранах читались бы
 * как разные данные.
 *
 * Пороги — не статистика, а честная грубость. На 12 ответах доля 4/12
 * имеет 95%-интервал примерно ±26 пунктов: это «medium» в смысле «направление
 * видно, точное число — нет». Обещать больше на таких выборках нельзя.
 */

export type ConfidenceLevel = "low" | "medium" | "high";

/** Ниже этого числа ответов цифру нельзя подавать как измерение (контракт C3). */
export const SAMPLE_CONFIDENCE_THRESHOLDS = {
  /** До 12 ответов интервал шире, чем большинство различий, которые мы обсуждаем. */
  medium: 12,
  /** От 60 ответов интервал сужается примерно до ±12 пунктов. */
  high: 60,
} as const;

export function confidenceFor(samples: number): ConfidenceLevel {
  if (samples >= SAMPLE_CONFIDENCE_THRESHOLDS.high) return "high";
  if (samples >= SAMPLE_CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

/** Достаточно ли ответов, чтобы вообще показывать число (а не прочерк). */
export function meetsSampleFloor(samples: number): boolean {
  return samples >= MIN_SAMPLES_PER_CELL;
}
