import { describe, expect, it } from "vitest";
import { MIN_SAMPLES_PER_CELL } from "./visibility";
import {
  computeProminence,
  shareOfNamed,
  type AnswerProminenceRecord,
} from "./prominence";

/**
 * Verify T93: заметность считается по уже сохранённому порядку упоминаний.
 * «Назван» и «назван первым» — разные вещи, и продукт обязан их различать.
 */

let seq = 0;

function answer(
  clientRank: number | null,
  competitorRanks: number[] = [],
): AnswerProminenceRecord {
  seq += 1;
  return { responseId: `r${seq}`, clientRank, competitorRanks };
}

describe("computeProminence", () => {
  it("считает названные ответы и среднее место", () => {
    const result = computeProminence([
      answer(1, [2, 3]),
      answer(3, [1, 2]),
      answer(null, [1, 2]),
    ]);

    expect(result).toMatchObject({ answers: 3, named: 2, averageRank: 2 });
  });

  it("названный первым отделён от просто названного", () => {
    const result = computeProminence([answer(1, [2]), answer(2, [1]), answer(2, [1])]);

    expect(result.named).toBe(3);
    expect(result.namedFirst).toBe(1);
  });

  it("ответ без конкурентов засчитывается как «раньше всех»", () => {
    const result = computeProminence([answer(1, [])]);

    expect(result.aheadOfCompetitors).toBe(1);
    expect(result.behindCompetitors).toBe(0);
  });

  it("клиент после конкурента считается отставшим", () => {
    const result = computeProminence([answer(4, [1, 2, 3])]);

    expect(result.aheadOfCompetitors).toBe(0);
    expect(result.behindCompetitors).toBe(1);
  });

  it("клиент вторым, но раньше остальных конкурентов — всё равно позади", () => {
    const result = computeProminence([answer(2, [1, 5])]);

    expect(result.behindCompetitors).toBe(1);
    expect(result.namedFirst).toBe(0);
  });

  it("ни одного упоминания — среднего места нет, а не ноль", () => {
    const result = computeProminence([answer(null, [1]), answer(null, [1])]);

    expect(result.named).toBe(0);
    expect(result.averageRank).toBeNull();
  });

  it("пустая выборка не выдаёт себя за измерение", () => {
    expect(computeProminence([]).sufficient).toBe(false);
  });

  it("порог сэмплов тот же, что у остальных метрик", () => {
    const records = Array.from({ length: MIN_SAMPLES_PER_CELL }, () => answer(1));

    expect(computeProminence(records).sufficient).toBe(true);
    expect(computeProminence(records.slice(1)).sufficient).toBe(false);
  });
});

describe("shareOfNamed", () => {
  it("доля считается от названных ответов, а не от всех", () => {
    expect(shareOfNamed(1, 4)).toBe(25);
  });

  it("без упоминаний доли нет", () => {
    expect(shareOfNamed(0, 0)).toBeNull();
  });
});
