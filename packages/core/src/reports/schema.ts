import { z } from "zod";

/**
 * Контракт C4 — то, что видит конечный клиент агентства.
 *
 * Схема жёсткая намеренно: отчёт уходит наружу, и любое поле, которое можно
 * заполнить свободным текстом, рано или поздно заполнят обещанием. Поэтому
 * оценка вклада — строка вида «+4–6 pp» рядом с уровнем уверенности,
 * а не число, притворяющееся точным.
 */

export const reportPayloadSchema = z.object({
  client: z.object({ name: z.string().min(1) }),
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),
  visibility: z.object({
    before: z.number(),
    after: z.number(),
  }),
  /** Процентные пункты; отрицательное значение = клиент отстаёт. */
  competitorGap: z.object({
    before: z.number(),
    after: z.number(),
  }),
  workCompleted: z.array(z.object({ label: z.string().min(1), count: z.number().int().min(0) })),
  results: z.object({
    newCitedUrls: z.number().int().min(0),
    newBrandMentions: z.number().int().min(0),
    visibilityDeltaPp: z.number(),
  }),
  highestImpactAction: z
    .object({
      title: z.string().min(1),
      /** Всегда диапазон и всегда «estimated» — см. инвариант 2. */
      estimatedContribution: z.string().min(1),
      confidence: z.enum(["low", "medium", "high"]),
    })
    .nullable(),
  nextSprint: z.array(z.string().min(1)),
  /**
   * Раздел бесплатного аудита. Есть только в отчёте по проспекту: у платящего
   * клиента отчёт показывает сделанное, а не предложение.
   */
  opportunity: z
    .object({
      currentVisibilityPct: z.number().min(0).max(100),
      competitorAverageVisibilityPct: z.number().min(0).max(100),
      /** Отрицательное значение = клиент отстаёт от средней по конкурентам. */
      gapPp: z.number(),
      rankedActions: z
        .array(
          z.object({
            title: z.string().min(1),
            /** Инвариант 7: рекомендация без причины не собирается. */
            reason: z.string().min(1),
            estimatedImpact: z.enum(["low", "medium", "high"]),
            effort: z.enum(["low", "medium", "high"]),
          }),
        )
        .max(20),
      scopeDays: z.number().int().positive(),
      suggestedRetainerUsd: z.number().int().positive(),
      estimatedEffortHours: z.object({
        min: z.number().positive(),
        max: z.number().positive(),
      }),
      /** Диапазон, а не точка: маржа зависит от часов, которые ещё не потрачены. */
      estimatedMarginPct: z.object({
        min: z.number(),
        max: z.number(),
      }),
    })
    .nullable()
    .default(null),
  /** Оговорки, которые обязаны дойти до клиента вместе с цифрами. */
  caveats: z.array(z.string().min(1)),
});

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
