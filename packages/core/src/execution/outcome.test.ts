import { describe, expect, it } from "vitest";
import { EXPERIMENT_COPY, MEASUREMENT_COPY } from "../copy";
import { checkSourceOutcome } from "./outcome";
import type { DatedCitationFact } from "./outcome";

/**
 * Verify T82: наблюдение о том, что изменилось после работы.
 *
 * Главное, что здесь проверяется, — продукт не выдаёт молчание за результат:
 * отсутствие упоминаний при трёх ответах и при нуле ответов — разные вещи.
 */

const ACTION_DATE = new Date("2026-08-01T00:00:00Z");

function fact(
  daysFromAction: number,
  clientMentioned: boolean,
  domain = "g2.com",
): DatedCitationFact {
  return {
    responseId: crypto.randomUUID(),
    domain,
    observedAt: new Date(ACTION_DATE.getTime() + daysFromAction * 24 * 60 * 60 * 1000),
    clientMentioned,
  };
}

function check(facts: DatedCitationFact[]) {
  return checkSourceOutcome({ facts, actionDate: ACTION_DATE, sourceDomain: "g2.com" });
}

describe("checkSourceOutcome", () => {
  it("клиент появился там, где его не было", () => {
    const outcome = check([
      fact(-14, false),
      fact(-7, false),
      fact(7, true),
      fact(14, true),
      fact(21, true),
    ]);

    expect(outcome.presentBefore).toBe(false);
    expect(outcome.presentAfter).toBe(true);
    expect(outcome.firstSeenAt).toEqual(new Date("2026-08-08T00:00:00Z"));
    expect(outcome.note).toContain("now mentioned");
  });

  it("первое появление — самое раннее, а не последнее", () => {
    const outcome = check([fact(20, true), fact(5, true), fact(12, true)]);

    expect(outcome.firstSeenAt).toEqual(new Date("2026-08-06T00:00:00Z"));
  });

  it("ноль ответов после работы — это не «результата нет»", () => {
    const outcome = check([fact(-10, false), fact(-3, false)]);

    expect(outcome.answersAfter).toBe(0);
    expect(outcome.sufficient).toBe(false);
    expect(outcome.note).toContain("No answers citing this source have been measured");
    expect(outcome.note).not.toContain("still not mentioned");
  });

  it("недобор ответов подаётся как недобор, а не как отсутствие", () => {
    const outcome = check([fact(3, false), fact(6, false)]);

    expect(outcome.sufficient).toBe(false);
    expect(outcome.note).toBe(MEASUREMENT_COPY.insufficientSamples);
  });

  it("при достаточной выборке отсутствие названо прямо", () => {
    const outcome = check([fact(3, false), fact(6, false), fact(9, false)]);

    expect(outcome.sufficient).toBe(true);
    expect(outcome.presentAfter).toBe(false);
    expect(outcome.note).toContain("still not mentioned");
  });

  it("присутствие и до, и после не выдаётся за достижение", () => {
    const outcome = check([fact(-5, true), fact(3, true), fact(6, true), fact(9, true)]);

    expect(outcome.presentBefore).toBe(true);
    expect(outcome.note).toContain("as it was before");
  });

  it("чужие источники в расчёт не идут", () => {
    const outcome = check([
      fact(5, true, "capterra.com"),
      fact(6, true, "capterra.com"),
      fact(7, false),
    ]);

    expect(outcome.answersAfter).toBe(1);
    expect(outcome.presentAfter).toBe(false);
  });

  it("ответ ровно в дату работы считается «после»", () => {
    const outcome = check([fact(0, true)]);

    expect(outcome.answersAfter).toBe(1);
    expect(outcome.answersBefore).toBe(0);
  });

  it("оговорка о причинности идёт всегда", () => {
    expect(check([]).disclaimer).toBe(EXPERIMENT_COPY.attributionLimits);
  });
});
