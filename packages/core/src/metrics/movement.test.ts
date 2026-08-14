import { describe, expect, it } from "vitest";
import { computeMovement, computePromptMatrix, type PromptResponseRecord } from "./matrix";

/**
 * Verify T93: «что изменилось» считается по вопросам, а не только целиком.
 * Окно без выборки не превращается в ноль изменений.
 */

const PROMPTS = [{ id: "p1", text: "best expense management software", clusterId: "c1" }];

const NOW = new Date("2026-08-13T00:00:00.000Z");
const FROM = new Date("2026-07-16T00:00:00.000Z");
const PREV_FROM = new Date("2026-06-18T00:00:00.000Z");

let seq = 0;

function answers(count: number, named: number, at: Date): PromptResponseRecord[] {
  return Array.from({ length: count }, (_, index) => {
    seq += 1;
    return {
      responseId: `r${seq}`,
      promptId: "p1",
      promptText: "best expense management software",
      clusterId: "c1",
      platform: "chatgpt" as const,
      createdAt: at,
      clientMentioned: index < named,
      competitorsMentioned: [],
    };
  });
}

function matrixOf(records: PromptResponseRecord[], from: Date, to: Date) {
  return computePromptMatrix({ records, prompts: PROMPTS, from, to });
}

describe("computeMovement", () => {
  it("считает изменение доли по вопросу", () => {
    const current = matrixOf(answers(4, 3, new Date("2026-08-01T00:00:00.000Z")), FROM, NOW);
    const previous = matrixOf(answers(4, 1, new Date("2026-07-01T00:00:00.000Z")), PREV_FROM, FROM);

    expect(computeMovement(current, previous)[0]).toMatchObject({ promptId: "p1", deltaPp: 50 });
  });

  it("на выборке в четыре ответа изменение не объявляется различимым", () => {
    const current = matrixOf(answers(4, 3, new Date("2026-08-01T00:00:00.000Z")), FROM, NOW);
    const previous = matrixOf(answers(4, 1, new Date("2026-07-01T00:00:00.000Z")), PREV_FROM, FROM);

    // Разница 50 пунктов, но интервалы на четырёх ответах перекрываются.
    expect(computeMovement(current, previous)[0]?.distinguishable).toBe(false);
  });

  it("на достаточной выборке различимое изменение помечается", () => {
    const current = matrixOf(answers(200, 150, new Date("2026-08-01T00:00:00.000Z")), FROM, NOW);
    const previous = matrixOf(
      answers(200, 60, new Date("2026-07-01T00:00:00.000Z")),
      PREV_FROM,
      FROM,
    );

    expect(computeMovement(current, previous)[0]?.distinguishable).toBe(true);
  });

  it("прошлое окно без выборки не даёт нулевого изменения", () => {
    const current = matrixOf(answers(4, 4, new Date("2026-08-01T00:00:00.000Z")), FROM, NOW);
    const previous = matrixOf([], PREV_FROM, FROM);

    expect(computeMovement(current, previous)[0]).toMatchObject({
      promptId: "p1",
      deltaPp: null,
      distinguishable: false,
    });
  });

  it("текущее окно ниже порога сравнивать тоже не с чем", () => {
    const current = matrixOf(answers(2, 2, new Date("2026-08-01T00:00:00.000Z")), FROM, NOW);
    const previous = matrixOf(answers(6, 3, new Date("2026-07-01T00:00:00.000Z")), PREV_FROM, FROM);

    expect(computeMovement(current, previous)[0]?.deltaPp).toBeNull();
  });

  it("одинаковые окна дают ноль, а не пропуск", () => {
    const current = matrixOf(answers(4, 2, new Date("2026-08-01T00:00:00.000Z")), FROM, NOW);
    const previous = matrixOf(answers(4, 2, new Date("2026-07-01T00:00:00.000Z")), PREV_FROM, FROM);

    expect(computeMovement(current, previous)[0]?.deltaPp).toBe(0);
  });
});
