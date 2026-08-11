import { describe, expect, it } from "vitest";
import {
  delta,
  estimateExperiment,
  EVIDENCE_COPY,
  formatEstimate,
  incrementalPp,
  MIN_SAMPLES_AFTER,
} from "./math";
import type { Confidence, ExperimentInputs } from "./math";

function inputs(overrides: Partial<ExperimentInputs> = {}): ExperimentInputs {
  return {
    treatmentBefore: 18,
    treatmentAfter: 34,
    controlBefore: 21,
    controlAfter: 23,
    treatmentSamplesAfter: 27,
    baselineSnapshots: 4,
    hasControlGroup: true,
    hasNewCitation: false,
    ...overrides,
  };
}

describe("delta и incrementalPp", () => {
  const cases: [number | null, number | null, number | null][] = [
    [18, 34, 16],
    [30, 20, -10],
    [20, 20, 0],
    [null, 34, null],
    [18, null, null],
  ];

  it.each(cases)("delta(%s, %s) = %s", (before, after, expected) => {
    expect(delta(before, after)).toBe(expected);
  });

  it("контракт C5: Δtreatment − Δcontrol", () => {
    expect(incrementalPp(16, 2)).toBe(14);
  });

  it("без контроля возвращается сырой сдвиг лечёной группы", () => {
    // Вычитать нечего; штраф за это уходит в confidence, а не в цифру.
    expect(incrementalPp(16, null)).toBe(16);
  });

  it("без измеренного сдвига результата нет", () => {
    expect(incrementalPp(null, 2)).toBeNull();
  });
});

describe("пример из спека: 18→34 против 21→23", () => {
  /** startup-spec §6.7: treatment +16 pp, control +2 pp, оценка +14 pp, medium. */
  const estimate = estimateExperiment(inputs());

  it("вклад оценивается в +14 pp", () => {
    expect(estimate.treatmentDeltaPp).toBe(16);
    expect(estimate.controlDeltaPp).toBe(2);
    expect(estimate.incrementalPp).toBe(14);
  });

  it("уверенность — medium", () => {
    expect(estimate.confidence).toBe("medium");
  });

  it("формулировка говорит «estimated», а не «proven»", () => {
    expect(formatEstimate(estimate)).toBe("Estimated incremental effect: +14 pp");
    expect(formatEstimate(estimate)).not.toMatch(/proven|proof|guaranteed|caused/i);
  });

  it("к результату приложен дисклеймер об ограничениях", () => {
    expect(estimate.disclaimer).toContain("evidence, not attribution of cause");
  });
});

describe("эвристика уверенности", () => {
  const cases: [string, Partial<ExperimentInputs>, Confidence][] = [
    ["полный набор признаков плюс новая цитата", { hasNewCitation: true }, "high"],
    ["пример из спека без новой цитаты", {}, "medium"],
    ["нет контрольной группы", { hasControlGroup: false, controlBefore: null, controlAfter: null }, "low"],
    ["мало ответов после действия", { treatmentSamplesAfter: 3 }, "low"],
    ["тонкий baseline", { baselineSnapshots: 1, treatmentSamplesAfter: 12 }, "medium"],
  ];

  it.each(cases)("%s -> %s", (_name, overrides, expected) => {
    expect(estimateExperiment(inputs(overrides)).confidence).toBe(expected);
  });

  it("отсутствие контроля штрафуется и названо в evidence", () => {
    const estimate = estimateExperiment(
      inputs({ hasControlGroup: false, controlBefore: null, controlAfter: null }),
    );

    // Спек предупреждает: без контроля движение неотделимо от роста платформ.
    expect(estimate.evidence).toContain(EVIDENCE_COPY.noControlGroup);
    expect(estimate.confidence).toBe("low");
  });

  it("контроль, сдвинувшийся почти как лечёная группа, уверенности не добавляет", () => {
    const together = estimateExperiment(inputs({ controlBefore: 21, controlAfter: 36 }));

    expect(together.evidence).toContain(EVIDENCE_COPY.controlMoved);
    expect(together.evidence).not.toContain(EVIDENCE_COPY.controlStable);
  });

  it("новая цитата — сильнейший из признаков", () => {
    const withCitation = estimateExperiment(inputs({ hasNewCitation: true }));
    const without = estimateExperiment(inputs({ hasNewCitation: false }));

    expect(withCitation.score - without.score).toBe(2);
    expect(withCitation.evidence).toContain(EVIDENCE_COPY.newCitation);
  });

  it("порог выборки назван явно и работает", () => {
    const enough = estimateExperiment(inputs({ treatmentSamplesAfter: MIN_SAMPLES_AFTER }));
    const few = estimateExperiment(inputs({ treatmentSamplesAfter: MIN_SAMPLES_AFTER - 1 }));

    expect(enough.evidence).toContain(EVIDENCE_COPY.enoughSamples);
    expect(few.evidence).toContain(EVIDENCE_COPY.fewSamples);
  });

  it("без измеренного эффекта уверенность всегда low", () => {
    const estimate = estimateExperiment(
      inputs({ treatmentBefore: null, hasNewCitation: true, treatmentSamplesAfter: 100 }),
    );

    // Даже при всех прочих признаках: оценивать нечего.
    expect(estimate.incrementalPp).toBeNull();
    expect(estimate.confidence).toBe("low");
    expect(formatEstimate(estimate)).toBe("Not enough data to estimate an effect yet.");
  });
});

describe("формулировки", () => {
  it("ни одна строка evidence не обещает причинность", () => {
    const banned = /\b(proof|proven|guarantee[d]?|caused|because of)\b/i;

    for (const value of Object.values(EVIDENCE_COPY)) {
      expect(value).not.toMatch(banned);
    }
  });

  it("падение подаётся так же прямо, как рост", () => {
    const estimate = estimateExperiment(
      inputs({ treatmentBefore: 34, treatmentAfter: 18, controlBefore: 21, controlAfter: 23 }),
    );

    expect(estimate.incrementalPp).toBe(-18);
    expect(formatEstimate(estimate)).toContain("-18 pp");
  });
});
