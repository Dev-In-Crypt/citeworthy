import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_MULTIPLIER,
  PRIORITY_THRESHOLDS,
  REOPEN_DELTA_POINTS,
  scoreOpportunity,
  shouldReopen,
  type ScoreInputs,
} from "./score";

/**
 * Оценка возможности — единственное число, по которому агентство решает, за
 * что браться. Поэтому она обязана быть воспроизводимой, ограниченной и
 * монотонной: если разрыв вырос, оценка не может упасть.
 *
 * Значения в таблице посчитаны вручную по формуле
 * merit = 0.4·impact + 0.25·coverage + 0.2·intent + 0.15·actionability,
 * score = round(100 · merit · confidence).
 */

function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    affectedPromptCount: 1,
    totalActivePromptCount: 12,
    intent: "comparison",
    samples: 60,
    actionType: "create_page",
    ...overrides,
  };
}

describe("scoreOpportunity", () => {
  it.each([
    [
      // Своя страница читается, но бренд в ответах не назван: доля выше
      // насыщения, почти вся тема, полностью под контролем агентства.
      // 0.4·1 + 0.25·0.83 + 0.2·0.9 + 0.15·1 = 0.9375 → 94
      "owned page read without the brand",
      inputs({ sharePct: 26, affectedPromptCount: 10, samples: 168, actionType: "refresh_page" }),
      94,
    ],
    [
      // Тот же вид разрыва, но на одном вопросе из двенадцати, на чужой
      // площадке и на впятеро меньшей выборке.
      // 0.4·0.72 + 0.25·0.08 + 0.2·0.9 + 0.15·0.4 = 0.548 · 0.85 → 47
      "editorial source the client is missing from",
      inputs({ sharePct: 18, affectedPromptCount: 1, samples: 20, actionType: "pr_editorial" }),
      47,
    ],
    [
      // 0.4·0.55 + 0.25·0.25 + 0.2·0.9 + 0.15·0.85 = 0.59 → 59
      "competitor ahead on three questions",
      inputs({ gapPp: 22, affectedPromptCount: 3 }),
      59,
    ],
    [
      // Всё по максимуму — верхняя граница шкалы достижима.
      "everything at its maximum",
      inputs({
        gapPp: 80,
        affectedPromptCount: 12,
        intent: "purchase",
        samples: 200,
        actionType: "refresh_page",
      }),
      100,
    ],
    [
      // Тот же случай на пяти ответах: множитель уверенности срезает его до 60.
      "the same gap measured on five answers",
      inputs({
        gapPp: 80,
        affectedPromptCount: 12,
        intent: "purchase",
        samples: 5,
        actionType: "refresh_page",
      }),
      60,
    ],
    [
      // Разрыв назван, ход — нет: 0.15·0.2 вместо 0.15·1.
      "a gap with no action to take",
      inputs({
        gapPp: 40,
        affectedPromptCount: 12,
        intent: "purchase",
        samples: 200,
        actionType: null,
      }),
      88,
    ],
    [
      // Ничего не измерено: остаются только интент и незнание хода.
      // 0.2·0.5 + 0.15·0.2 = 0.13 · 0.6 → 8
      "nothing measured at all",
      inputs({ affectedPromptCount: 0, intent: "learning", samples: 0, actionType: null }),
      8,
    ],
    [
      // Отрицательное отставание — это не разрыв, а опережение: impact = 0.
      // 0 + 0.25·0.25 + 0.2·0.9 + 0.15·0.85 = 0.37 → 37
      "the client is ahead",
      inputs({ gapPp: -10, affectedPromptCount: 3 }),
      37,
    ],
  ])("%s → %i", (_name, given, expected) => {
    expect(scoreOpportunity(given).score).toBe(expected);
  });

  it("всегда даёт целое число в диапазоне 0..100", () => {
    const grid: ScoreInputs[] = [];
    for (const gapPp of [-100, 0, 1, 39, 40, 1000]) {
      for (const affected of [0, 1, 12, 50]) {
        for (const samples of [0, 3, 12, 60, 10_000]) {
          grid.push(inputs({ gapPp, affectedPromptCount: affected, samples }));
        }
      }
    }

    for (const given of grid) {
      const { score } = scoreOpportunity(given);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("не падает, когда любой отдельный множитель растёт", () => {
    const base = inputs({ gapPp: 10, affectedPromptCount: 2, samples: 12 });
    const baseline = scoreOpportunity(base).score;

    expect(scoreOpportunity({ ...base, gapPp: 30 }).score).toBeGreaterThanOrEqual(baseline);
    expect(scoreOpportunity({ ...base, affectedPromptCount: 9 }).score).toBeGreaterThanOrEqual(
      baseline,
    );
    expect(scoreOpportunity({ ...base, intent: "purchase" }).score).toBeGreaterThanOrEqual(baseline);
    expect(scoreOpportunity({ ...base, samples: 120 }).score).toBeGreaterThanOrEqual(baseline);
    expect(scoreOpportunity({ ...base, actionType: "refresh_page" }).score).toBeGreaterThanOrEqual(
      baseline,
    );
  });

  it("на недостоверной выборке не может подняться выше 60", () => {
    // Это и есть смысл множителя: размером разрыва нельзя компенсировать то,
    // что его толком не измерили.
    const cap = Math.round(100 * 1 * CONFIDENCE_MULTIPLIER.low);

    for (const samples of [0, 1, 5, 11]) {
      const { score } = scoreOpportunity(
        inputs({
          gapPp: 999,
          affectedPromptCount: 99,
          intent: "purchase",
          samples,
          actionType: "refresh_page",
        }),
      );
      expect(score).toBeLessThanOrEqual(cap);
    }
  });

  it("даёт один и тот же результат на одном и том же входе", () => {
    const given = inputs({ gapPp: 17, affectedPromptCount: 4, samples: 33 });
    expect(scoreOpportunity(given)).toEqual(scoreOpportunity(given));
  });

  it("кладёт в разбор всё, из чего собрана оценка", () => {
    // Без этого «почему здесь 91» пришлось бы отвечать пересчётом, а окно
    // измерения к тому времени уже другое.
    const breakdown = scoreOpportunity(inputs({ gapPp: 20, samples: 60 }));

    expect(breakdown.factors.impact).toBe(0.5);
    expect(breakdown.confidenceLevel).toBe("high");
    expect(breakdown.inputs.gapPp).toBe(20);
    expect(breakdown.version).toBeGreaterThan(0);
  });

  it("выводит приоритет из оценки, а не задаёт его отдельно", () => {
    // Два источника истины разошлись бы в первом же спорном случае.
    const cases = [
      inputs({ gapPp: 80, affectedPromptCount: 12, intent: "purchase", samples: 200 }),
      inputs({ gapPp: 22, affectedPromptCount: 3 }),
      inputs({ affectedPromptCount: 0, intent: "learning", samples: 0, actionType: null }),
    ];

    for (const given of cases) {
      const { score, priority } = scoreOpportunity(given);
      const expected =
        score >= PRIORITY_THRESHOLDS.high
          ? "high"
          : score >= PRIORITY_THRESHOLDS.medium
            ? "medium"
            : "low";
      expect(priority).toBe(expected);
    }
  });
});

describe("shouldReopen", () => {
  it("возвращает отклонённое, только когда оно заметно выросло", () => {
    expect(shouldReopen(40, 40)).toBe(false);
    expect(shouldReopen(40 + REOPEN_DELTA_POINTS - 1, 40)).toBe(false);
    expect(shouldReopen(40 + REOPEN_DELTA_POINTS, 40)).toBe(true);
  });

  it("без записанной оценки решения не возвращает ничего", () => {
    // Иначе первый же пересчёт отменил бы решение, принятое до того, как
    // оценка вообще начала записываться.
    expect(shouldReopen(100, null)).toBe(false);
  });
});
