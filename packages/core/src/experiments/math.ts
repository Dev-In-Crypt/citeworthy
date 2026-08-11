import { EXPERIMENT_COPY } from "../copy";

/**
 * Контракт C5. Оценка вклада действия и уверенность в ней.
 *
 * Это НЕ доказательство причинности. Академический обзор 45 GEO-исследований
 * (см. спек, §11) не нашёл надёжно продемонстрированного причинного эффекта,
 * а на одном клиенте настоящей контрольной группы не существует вовсе.
 * Поэтому здесь считается «estimated incremental effect» рядом с группой
 * сравнения, а уверенность выражается словом, а не числом с процентами:
 * точность, которой нет, не должна выглядеть как точность.
 */

export type Confidence = "low" | "medium" | "high";

export interface ExperimentInputs {
  treatmentBefore: number | null;
  treatmentAfter: number | null;
  controlBefore: number | null;
  controlAfter: number | null;
  /** Число ответов в измерениях treatment-группы после действия. */
  treatmentSamplesAfter: number;
  /** Сколько недельных срезов вошло в baseline. */
  baselineSnapshots: number;
  /** Есть ли вообще с чем сравнивать. */
  hasControlGroup: boolean;
  /** Появился ли после действия источник, которого раньше не было. */
  hasNewCitation: boolean;
}

export interface ExperimentEstimate {
  treatmentDeltaPp: number | null;
  controlDeltaPp: number | null;
  /** (Δtreatment − Δcontrol). Null, если считать не из чего. */
  incrementalPp: number | null;
  confidence: Confidence;
  score: number;
  evidence: string[];
  /** Всегда сопровождает результат: это запись, а не атрибуция причины. */
  disclaimer: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Δ = после − до. Null, если одна из сторон не измерена. */
export function delta(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return round1(after - before);
}

/**
 * Контракт C5: incremental_pp = Δtreatment − Δcontrol.
 *
 * Без контрольной группы вычитать нечего, и тогда возвращается сырой Δtreatment —
 * но уверенность за это штрафуется: движение может целиком объясняться ростом
 * самих платформ.
 */
export function incrementalPp(
  treatmentDelta: number | null,
  controlDelta: number | null,
): number | null {
  if (treatmentDelta === null) return null;
  if (controlDelta === null) return treatmentDelta;
  return round1(treatmentDelta - controlDelta);
}

/** Минимум ответов после действия, ниже которого сравнение несерьёзно. */
export const MIN_SAMPLES_AFTER = 9;

/** Пороги перевода баллов в слово. */
export const CONFIDENCE_THRESHOLDS = { high: 6, medium: 3 } as const;

export const EVIDENCE_COPY = {
  controlGroup: "Compared against clusters the action did not touch.",
  noControlGroup: "No untouched clusters to compare against; platform-wide drift is not separated.",
  controlStable: "The comparison group moved far less than the treated one.",
  controlMoved: "The comparison group moved almost as much, so the difference is hard to attribute.",
  enoughSamples: "Enough answers after the action for the share to be readable.",
  fewSamples: "Few answers after the action; the share is unstable.",
  baselineDepth: "Baseline covers several weeks before the action.",
  thinBaseline: "Baseline covers fewer weeks than the minimum.",
  newCitation: "A source that was not cited before the action appeared afterwards.",
  noNewCitation: "No new cited source has appeared since the action.",
} as const;

/**
 * Балльная эвристика. Намеренно простая и читаемая: агентство должно понимать,
 * почему стоит «medium», а не доверять непрозрачной формуле.
 */
export function estimateExperiment(inputs: ExperimentInputs): ExperimentEstimate {
  const treatmentDeltaPp = delta(inputs.treatmentBefore, inputs.treatmentAfter);
  const controlDeltaPp = delta(inputs.controlBefore, inputs.controlAfter);
  const incremental = incrementalPp(treatmentDeltaPp, controlDeltaPp);

  const evidence: string[] = [];
  let score = 0;

  if (inputs.hasControlGroup && controlDeltaPp !== null) {
    score += 1;
    evidence.push(EVIDENCE_COPY.controlGroup);

    // Контроль считается стабильным, если сдвинулся меньше чем наполовину
    // от лечёной группы: иначе движение общее, а не наше.
    const stable =
      treatmentDeltaPp !== null && Math.abs(controlDeltaPp) <= Math.abs(treatmentDeltaPp) / 2;
    if (stable) {
      score += 1;
      evidence.push(EVIDENCE_COPY.controlStable);
    } else {
      evidence.push(EVIDENCE_COPY.controlMoved);
    }
  } else {
    score -= 2;
    evidence.push(EVIDENCE_COPY.noControlGroup);
  }

  if (inputs.treatmentSamplesAfter >= MIN_SAMPLES_AFTER) {
    score += 2;
    evidence.push(EVIDENCE_COPY.enoughSamples);
  } else {
    // Недобор выборки штрафуется наравне с отсутствием контроля: доля,
    // посчитанная по трём ответам, — это не слабое измерение, а его отсутствие
    // (инвариант 6). Прочие признаки не должны его перевешивать.
    score -= 2;
    evidence.push(EVIDENCE_COPY.fewSamples);
  }

  if (inputs.baselineSnapshots >= 2) {
    score += 1;
    evidence.push(EVIDENCE_COPY.baselineDepth);
  } else {
    evidence.push(EVIDENCE_COPY.thinBaseline);
  }

  if (inputs.hasNewCitation) {
    score += 2;
    evidence.push(EVIDENCE_COPY.newCitation);
  } else {
    evidence.push(EVIDENCE_COPY.noNewCitation);
  }

  // Без измеренного эффекта уверенность не обсуждается.
  const confidence: Confidence =
    incremental === null
      ? "low"
      : score >= CONFIDENCE_THRESHOLDS.high
        ? "high"
        : score >= CONFIDENCE_THRESHOLDS.medium
          ? "medium"
          : "low";

  return {
    treatmentDeltaPp,
    controlDeltaPp,
    incrementalPp: incremental,
    confidence,
    score,
    evidence,
    disclaimer: EXPERIMENT_COPY.attributionLimits,
  };
}

/** Формулировка эффекта для интерфейса. Всегда «estimated», никогда «proven». */
export function formatEstimate(estimate: ExperimentEstimate): string {
  if (estimate.incrementalPp === null) {
    return "Not enough data to estimate an effect yet.";
  }
  const sign = estimate.incrementalPp >= 0 ? "+" : "";
  return `${EXPERIMENT_COPY.estimatedEffect}: ${sign}${estimate.incrementalPp} pp`;
}
