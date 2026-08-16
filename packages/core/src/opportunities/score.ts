import { confidenceFor, type ConfidenceLevel } from "../metrics/confidence";
import type { ActionType } from "../diagnosis/recommendations";
import type { PromptIntent } from "../import/csv";

/**
 * Оценка возможности: 0–100, детерминированно и с разбором.
 *
 * Число нужно ровно для одного: агентство ведёт десяток клиентов и должно за
 * секунды понять, за что браться первым. Поэтому оно обязано быть объяснимым —
 * рядом с ним всегда лежит breakdown, из которого видно, почему одна
 * возможность 95, а другая 40.
 *
 * Числа никогда не приходят от модели. Всё здесь — чистая функция от уже
 * измеренных фактов, и одинаковый вход обязан давать одинаковый выход:
 * оценка, которая меняется сама по себе, ничего не приоритизирует.
 *
 * Оценка не попадает клиенту. Это внутренний инструмент сортировки; в
 * white-label отчёте он читался бы как оценка сайта клиента по стобалльной
 * шкале, а разговор, который за этим следует, агентству не нужен.
 */

export const SCORE_VERSION = 1;

/**
 * Веса слагаемых. Impact, coverage, intent и actionability взаимозаменяемы:
 * слабое одно вытягивается сильным другим — так и работает приоритизация.
 */
export const SCORE_WEIGHTS = {
  impact: 0.4,
  coverage: 0.25,
  commercialIntent: 0.2,
  actionability: 0.15,
} as const;

/**
 * Уверенность — множитель, а не слагаемое. Это принципиально: у плохо
 * измеренной возможности не должно быть способа выехать наверх за счёт
 * размера. Потолок для low выходит около 60 — и это правильный потолок.
 */
export const CONFIDENCE_MULTIPLIER: Record<ConfidenceLevel, number> = {
  low: 0.6,
  medium: 0.85,
  high: 1,
} as const;

/**
 * Насыщение: дальше этих значений лишние пункты уже не меняют решения.
 * Отставание в 60 пунктов и в 40 требуют одного и того же — заняться этим.
 */
export const IMPACT_SATURATION = { gapPp: 40, sharePct: 25 } as const;

/** Коммерческий вес вопроса: покупательские важнее обучающих. */
export const INTENT_WEIGHT: Record<PromptIntent, number> = {
  purchase: 1,
  comparison: 0.9,
  other: 0.6,
  learning: 0.5,
} as const;

/**
 * Насколько работа вообще выполнима агентством.
 *
 * Своя страница — полностью в его руках; попадание в редакционный материал
 * зависит от чужого редактора, а в обсуждение на форуме — от чужих людей.
 * Возможность, которую нельзя реализовать, не должна стоять первой в очереди,
 * какого бы размера она ни была.
 */
export const ACTIONABILITY: Record<ActionType, number> = {
  refresh_page: 1,
  structured_data_fix: 0.95,
  create_page: 0.85,
  technical_fix: 0.85,
  crawler_fix: 0.85,
  product_data_update: 0.8,
  review_platform: 0.75,
  source_outreach: 0.5,
  pr_editorial: 0.4,
  ugc_community: 0.35,
};

/** Разрыв назван, а ход — нет. Такое стоит меньше любого названного хода. */
export const ACTIONABILITY_UNKNOWN = 0.2;

/**
 * На сколько пунктов возможность должна вырасти, чтобы вернуться после
 * отклонения. Отклонение — решение о фактах на тот момент, а не приговор
 * навсегда: если разрыв заметно вырос, его стоит показать снова.
 */
export const REOPEN_DELTA_POINTS = 15;

export const PRIORITY_THRESHOLDS = { high: 70, medium: 40 } as const;

export type OpportunityPriority = "low" | "medium" | "high";

export interface ScoreInputs {
  /** Отставание в пунктах — для разрывов против конкурентов и по кластерам. */
  gapPp?: number;
  /** Доля цитирований источника — для разрывов по источникам и контенту. */
  sharePct?: number;
  affectedPromptCount: number;
  totalActivePromptCount: number;
  intent: PromptIntent;
  /** Сколько ответов стоит за возможностью. */
  samples: number;
  actionType: ActionType | null;
}

export interface ScoreFactors {
  impact: number;
  coverage: number;
  commercialIntent: number;
  actionability: number;
  confidence: number;
}

export interface ScoreBreakdown {
  version: number;
  score: number;
  priority: OpportunityPriority;
  factors: ScoreFactors;
  weights: typeof SCORE_WEIGHTS;
  confidenceLevel: ConfidenceLevel;
  inputs: ScoreInputs;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function priorityFor(score: number): OpportunityPriority {
  if (score >= PRIORITY_THRESHOLDS.high) return "high";
  if (score >= PRIORITY_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * Impact берётся из того признака, который у этого вида возможности вообще
 * измерен: отставание в пунктах или доля цитирований. Если не задано ни одно,
 * величина неизвестна — и это ноль, а не догадка.
 */
function impactFrom(inputs: ScoreInputs): number {
  if (inputs.gapPp !== undefined) {
    return clamp01(inputs.gapPp / IMPACT_SATURATION.gapPp);
  }
  if (inputs.sharePct !== undefined) {
    return clamp01(inputs.sharePct / IMPACT_SATURATION.sharePct);
  }
  return 0;
}

export function scoreOpportunity(inputs: ScoreInputs): ScoreBreakdown {
  const confidenceLevel = confidenceFor(inputs.samples);

  const factors: ScoreFactors = {
    impact: round2(impactFrom(inputs)),
    // Доля отслеживаемых вопросов, а НЕ частотность запросов: данных о спросе
    // у продукта нет, и называть это frequency значило бы обещать их.
    coverage: round2(
      clamp01(inputs.affectedPromptCount / Math.max(1, inputs.totalActivePromptCount)),
    ),
    commercialIntent: INTENT_WEIGHT[inputs.intent],
    actionability:
      inputs.actionType === null ? ACTIONABILITY_UNKNOWN : ACTIONABILITY[inputs.actionType],
    confidence: CONFIDENCE_MULTIPLIER[confidenceLevel],
  };

  const merit =
    SCORE_WEIGHTS.impact * factors.impact +
    SCORE_WEIGHTS.coverage * factors.coverage +
    SCORE_WEIGHTS.commercialIntent * factors.commercialIntent +
    SCORE_WEIGHTS.actionability * factors.actionability;

  const raw = Math.round(100 * merit * factors.confidence);
  const score = Math.min(100, Math.max(0, raw));

  return {
    version: SCORE_VERSION,
    score,
    priority: priorityFor(score),
    factors,
    weights: SCORE_WEIGHTS,
    confidenceLevel,
    inputs,
  };
}

/**
 * Вернулась ли отклонённая возможность настолько, чтобы показать её снова.
 * Держится здесь, а не в SQL: порог — продуктовое решение, и место ему рядом
 * с самой оценкой.
 */
export function shouldReopen(currentScore: number, decisionScore: number | null): boolean {
  if (decisionScore === null) return false;
  return currentScore >= decisionScore + REOPEN_DELTA_POINTS;
}
