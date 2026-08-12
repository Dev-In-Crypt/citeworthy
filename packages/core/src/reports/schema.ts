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
  /** Оговорки, которые обязаны дойти до клиента вместе с цифрами. */
  caveats: z.array(z.string().min(1)),
});

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
