import { describe, expect, it } from "vitest";
import { CONFIDENCE_LABELS } from "../copy";
import { MIN_SAMPLES_PER_CELL } from "./visibility";
import { SAMPLE_CONFIDENCE_THRESHOLDS, confidenceFor, meetsSampleFloor } from "./confidence";

/**
 * Verify T87: одно определение уверенности на весь продукт. Разные пороги
 * на разных экранах читались бы как разные данные.
 */

describe("confidenceFor", () => {
  const cases: [number, "low" | "medium" | "high"][] = [
    [0, "low"],
    [1, "low"],
    [SAMPLE_CONFIDENCE_THRESHOLDS.medium - 1, "low"],
    [SAMPLE_CONFIDENCE_THRESHOLDS.medium, "medium"],
    [SAMPLE_CONFIDENCE_THRESHOLDS.high - 1, "medium"],
    [SAMPLE_CONFIDENCE_THRESHOLDS.high, "high"],
    [1000, "high"],
  ];

  it.each(cases)("%i ответов → %s", (samples, expected) => {
    expect(confidenceFor(samples)).toBe(expected);
  });

  it("у каждого уровня есть готовая подпись", () => {
    for (const level of ["low", "medium", "high"] as const) {
      expect(CONFIDENCE_LABELS[level]).toContain("onfidence");
    }
  });
});

describe("meetsSampleFloor", () => {
  it("порог тот же, что у контракта C3 — второго определения быть не должно", () => {
    expect(meetsSampleFloor(MIN_SAMPLES_PER_CELL)).toBe(true);
    expect(meetsSampleFloor(MIN_SAMPLES_PER_CELL - 1)).toBe(false);
  });
});
