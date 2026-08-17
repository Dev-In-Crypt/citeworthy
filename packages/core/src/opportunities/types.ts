import { z } from "zod";
import { recommendationSchema } from "../diagnosis/recommendations";

/**
 * Возможность — главный рабочий объект агентства.
 *
 * Она отвечает на один вопрос: где клиент проигрывает в ответах ассистентов,
 * почему это происходит и что с этим можно сделать. До неё продукт считал
 * диагноз заново на каждый заход и ничего не сохранял: приоритизировать было
 * нечего, переносить в работу — нечего, показать клиенту как причину
 * ретейнера — тоже нечего.
 *
 * Всё здесь — чистые типы и чистые функции. Ни одна строка не приходит от
 * модели: числа берутся из измерений, формулировки — из шаблонов.
 */

export const OPPORTUNITY_KINDS = [
  "competitor_gap",
  "source_gap",
  "content_gap",
  "cluster_gap",
] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

/**
 * Вид `technical` сознательно отсутствует. Технические причины (краулер,
 * разметка, недоступность страницы) требуют обхода сайта, которого продукт не
 * делает. Завести вид без детектора значило бы предложить агентству рубрику,
 * которую нечем наполнить, кроме догадок.
 */

export const OPPORTUNITY_STATUSES = ["open", "snoozed", "dismissed", "converted"] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/**
 * Ключ, по которому возможность узнаётся между пересчётами.
 *
 * В него не входят ни оценка, ни дата, ни счётчики: всё, что законно меняется
 * от прогона к прогону, превратило бы ту же самую возможность в новую строку —
 * и решение человека («это мы не делаем») потерялось бы молча.
 *
 * Источник ключуется по домену на весь аккаунт клиента, а не по кластеру:
 * попадание на g2.com — одна работа, даже если разрыв виден в трёх кластерах.
 */
export type DedupeKeyInput =
  | { kind: "competitor_gap"; clusterId: string; competitor: string }
  | { kind: "source_gap"; domain: string }
  | { kind: "content_gap"; clusterId: string }
  | { kind: "content_gap"; domain: string }
  | { kind: "cluster_gap"; clusterId: string };

export function dedupeKeyFor(input: DedupeKeyInput): string {
  switch (input.kind) {
    case "competitor_gap":
      // Ключуется парой «тема + конкурент», а не отдельным вопросом. Один и
      // тот же конкурент, обходящий клиента на трёх вопросах одной темы, —
      // это одна работа и одна строка, а не три одинаковых с разной оценкой.
      return `competitor_gap:cluster:${input.clusterId}:vs:${input.competitor}`;
    case "source_gap":
      return `source_gap:domain:${input.domain}`;
    case "cluster_gap":
      return `cluster_gap:cluster:${input.clusterId}`;
    case "content_gap":
      return "domain" in input
        ? `content_gap:owned:${input.domain}`
        : `content_gap:cluster:${input.clusterId}`;
  }
}

/** Один ассистент внутри доказательства: сколько спросили и что вышло. */
const assistantCellSchema = z.object({
  assistantId: z.string().min(1),
  samples: z.number().int().nonnegative(),
  ratePct: z.number().nullable(),
  competitorOnly: z.boolean(),
});

/**
 * Доказательство — те самые числа, на которых стоит оценка, замороженные в
 * момент расчёта. Пересчитывать их при открытии карточки нельзя: окно
 * измерения скользящее, и «почему здесь 91» получило бы ответ из других
 * данных, чем те, что дали 91.
 */
export const opportunityEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("competitor_gap"),
    clusterId: z.string().min(1),
    clusterName: z.string().min(1),
    competitorName: z.string().min(1),
    /** Доли по группе целиком, взвешенные по числу ответов. */
    clientPct: z.number(),
    competitorPct: z.number(),
    gapPp: z.number(),
    samples: z.number().int().nonnegative(),
    /** Каждый вопрос группы со своими числами: агрегат сверху, детали ниже. */
    prompts: z.array(
      z.object({
        promptId: z.string().min(1),
        promptText: z.string().min(1),
        clientPct: z.number().nullable(),
        competitorPct: z.number(),
        gapPp: z.number(),
        samples: z.number().int().nonnegative(),
        deltaPp: z.number().nullable(),
        distinguishable: z.boolean(),
      }),
    ),
    assistants: z.array(assistantCellSchema),
  }),
  z.object({
    kind: z.literal("source_gap"),
    domain: z.string().min(1),
    sourceType: z.string().nullable(),
    citations: z.number().int().nonnegative(),
    sharePct: z.number(),
    competitorsPresent: z.array(z.string()),
    influentialCount: z.number().int().nonnegative(),
    clusters: z.array(z.object({ clusterId: z.string(), clusterName: z.string() })),
    samples: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("content_gap"),
    /** no_owned_page — своей страницы вообще не цитируют;
     *  owned_without_brand — цитируют, но бренд в ответе не назван. */
    variant: z.enum(["no_owned_page", "owned_without_brand"]),
    clusterId: z.string().min(1),
    clusterName: z.string().min(1),
    domain: z.string().nullable(),
    citations: z.number().int().nonnegative(),
    sharePct: z.number(),
    influentialCount: z.number().int().nonnegative(),
    topDomains: z.array(z.object({ domain: z.string(), sharePct: z.number() })),
    samples: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("cluster_gap"),
    clusterId: z.string().min(1),
    clusterName: z.string().min(1),
    clusterPct: z.number(),
    overallPct: z.number(),
    gapPp: z.number(),
    prompts: z.array(
      z.object({
        promptId: z.string(),
        promptText: z.string(),
        ratePct: z.number().nullable(),
        samples: z.number().int().nonnegative(),
      }),
    ),
    samples: z.number().int().nonnegative(),
  }),
]);

export type OpportunityEvidence = z.infer<typeof opportunityEvidenceSchema>;

const scoreFactorsSchema = z.object({
  impact: z.number(),
  coverage: z.number(),
  commercialIntent: z.number(),
  actionability: z.number(),
  confidence: z.number(),
});

export const scoreBreakdownSchema = z.object({
  version: z.number().int().positive(),
  score: z.number().int().min(0).max(100),
  priority: z.enum(["low", "medium", "high"]),
  factors: scoreFactorsSchema,
  weights: z.record(z.string(), z.number()),
  confidenceLevel: z.enum(["low", "medium", "high"]),
  inputs: z.object({
    gapPp: z.number().optional(),
    sharePct: z.number().optional(),
    affectedPromptCount: z.number().int().nonnegative(),
    totalActivePromptCount: z.number().int().nonnegative(),
    intent: z.enum(["learning", "comparison", "purchase", "other"]),
    samples: z.number().int().nonnegative(),
    actionType: z.string().nullable(),
  }),
});

export const detectedOpportunitySchema = z.object({
  kind: z.enum(OPPORTUNITY_KINDS),
  dedupeKey: z.string().min(1),
  title: z.string().min(1),
  /** Инвариант 7: возможность без объяснения бесполезна агентству. */
  reason: z.string().min(1),
  score: z.number().int().min(0).max(100),
  priority: z.enum(["low", "medium", "high"]),
  scoreBreakdown: scoreBreakdownSchema,
  evidenceLevel: z.enum(["low", "medium", "high"]),
  evidence: opportunityEvidenceSchema,
  /** Кандидаты в работу. Строками в actions они станут только при переносе. */
  recommendedActions: z.array(recommendationSchema).min(1),
  affectedPromptIds: z.array(z.string()),
  affectedClusterIds: z.array(z.string()),
  competitorNames: z.array(z.string()),
  sourceDomain: z.string().nullable(),
  sampleCount: z.number().int().nonnegative(),
});

export type DetectedOpportunity = z.infer<typeof detectedOpportunitySchema>;

/** Единственный способ собрать возможность: схема проверяется на входе. */
export function makeDetectedOpportunity(input: DetectedOpportunity): DetectedOpportunity {
  return detectedOpportunitySchema.parse(input);
}
