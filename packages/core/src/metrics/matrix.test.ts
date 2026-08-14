import { describe, expect, it } from "vitest";
import { ASSISTANTS } from "../adapters/catalogue";
import { MIN_SAMPLES_PER_CELL } from "./visibility";
import { confidenceFor } from "./confidence";
import { collapsePromptFacts, computePromptMatrix, type PromptResponseRecord } from "./matrix";

/**
 * Verify T87: матрица — тот же контракт C3, разложенный по промптам.
 * Порог сэмплов, неспрошенные ассистенты и «назвали их, а не вас».
 */

const FROM = new Date("2026-07-16T00:00:00.000Z");
const TO = new Date("2026-08-13T00:00:00.000Z");
const IN_WINDOW = new Date("2026-08-01T12:00:00.000Z");

const PROMPTS = [
  { id: "p1", text: "best expense management software", clusterId: "c1" },
  { id: "p2", text: "Ledgerbrook vs Outlay", clusterId: "c1" },
];

let seq = 0;

function record(patch: Partial<PromptResponseRecord> = {}): PromptResponseRecord {
  seq += 1;
  return {
    responseId: `r${seq}`,
    promptId: "p1",
    promptText: "best expense management software",
    clusterId: "c1",
    platform: "chatgpt",
    createdAt: IN_WINDOW,
    clientMentioned: false,
    competitorsMentioned: [],
    ...patch,
  };
}

function times(count: number, patch: Partial<PromptResponseRecord> = {}): PromptResponseRecord[] {
  return Array.from({ length: count }, () => record(patch));
}

function matrixOf(records: PromptResponseRecord[]) {
  return computePromptMatrix({ records, prompts: PROMPTS, from: FROM, to: TO });
}

function cell(matrix: ReturnType<typeof matrixOf>, promptId: string, assistantId: string) {
  const row = matrix.rows.find((r) => r.promptId === promptId);
  return row?.cells.find((c) => c.assistantId === assistantId);
}

describe("computePromptMatrix", () => {
  it("ячейка выше порога показывает долю ответов с клиентом", () => {
    const matrix = matrixOf([
      ...times(3, { clientMentioned: true }),
      ...times(1, { clientMentioned: false }),
    ]);

    expect(cell(matrix, "p1", "chatgpt")).toMatchObject({
      samples: 4,
      ratePct: 75,
      sufficient: true,
    });
  });

  it("ниже порога числа нет — там прочерк, а не ноль", () => {
    const matrix = matrixOf(times(MIN_SAMPLES_PER_CELL - 1, { clientMentioned: true }));

    expect(cell(matrix, "p1", "chatgpt")).toMatchObject({
      samples: MIN_SAMPLES_PER_CELL - 1,
      ratePct: null,
      sufficient: false,
    });
  });

  it("ноль упоминаний при достаточной выборке — это измеренный ноль, а не пустота", () => {
    const matrix = matrixOf(times(6, { clientMentioned: false }));

    expect(cell(matrix, "p1", "chatgpt")).toMatchObject({ ratePct: 0, sufficient: true });
  });

  it("конкурент назван там, где клиента нет — отмечается отдельно", () => {
    const matrix = matrixOf([
      ...times(3, { clientMentioned: false, competitorsMentioned: ["Outlay"] }),
      ...times(1, { clientMentioned: true, competitorsMentioned: ["Outlay"] }),
    ]);

    expect(cell(matrix, "p1", "chatgpt")?.competitorOnly).toBe(true);
  });

  it("ответ, где назвали обоих, не считается «назвали их вместо вас»", () => {
    const matrix = matrixOf(
      times(4, { clientMentioned: true, competitorsMentioned: ["Outlay", "Tallyard"] }),
    );

    expect(cell(matrix, "p1", "chatgpt")?.competitorOnly).toBe(false);
  });

  it("неизмеряемый ассистент получает столбец, но ни числа, ни выборки", () => {
    const matrix = matrixOf(times(6, { clientMentioned: true }));

    const claude = cell(matrix, "p1", "claude");
    expect(claude).toMatchObject({ measurable: false, samples: 0, ratePct: null });
  });

  it("неизмеряемый ассистент не попадает ни в один знаменатель", () => {
    const matrix = matrixOf(times(6, { clientMentioned: true }));

    expect(matrix.totals.samples).toBe(6);
    expect(matrix.totals.ratePct).toBe(100);

    const unmeasured = matrix.assistants.filter((a) => !a.measurable);
    expect(unmeasured).toHaveLength(4);
    expect(unmeasured.every((a) => a.samples === 0 && a.ratePct === null)).toBe(true);
  });

  it("ответ по платформе вне каталога игнорируется целиком", () => {
    const matrix = matrixOf([
      ...times(4, { clientMentioned: true }),
      ...times(4, { clientMentioned: true, platform: "unknown-engine" as never }),
    ]);

    expect(matrix.totals.samples).toBe(4);
  });

  it("ответы вне окна не учитываются", () => {
    const matrix = matrixOf([
      ...times(4, { clientMentioned: true }),
      ...times(4, { clientMentioned: true, createdAt: new Date("2026-05-01T00:00:00.000Z") }),
    ]);

    expect(matrix.totals.samples).toBe(4);
  });

  it("промпт без ответов остаётся строкой — исчезнуть он не должен", () => {
    const matrix = matrixOf(times(4, { clientMentioned: true, promptId: "p1" }));

    const empty = matrix.rows.find((r) => r.promptId === "p2");
    expect(empty).toMatchObject({ samples: 0, ratePct: null, sufficient: false });
    expect(empty?.cells).toHaveLength(ASSISTANTS.length);
  });

  it("порядок строк — тот, что задал вызывающий", () => {
    const matrix = matrixOf(times(4, { clientMentioned: true }));

    expect(matrix.rows.map((r) => r.promptId)).toEqual(["p1", "p2"]);
  });

  it("сильнейший конкурент строки считается по тем же ответам", () => {
    const matrix = matrixOf([
      ...times(3, { competitorsMentioned: ["Outlay"] }),
      ...times(1, { competitorsMentioned: ["Outlay", "Tallyard"] }),
    ]);

    const row = matrix.rows.find((r) => r.promptId === "p1");
    expect(row?.competitorTop).toEqual({ name: "Outlay", pct: 100 });
  });

  it("несколько упоминаний одного конкурента в одном ответе считаются один раз", () => {
    const matrix = matrixOf(times(4, { competitorsMentioned: ["Outlay", "Outlay"] }));

    expect(matrix.rows[0]?.competitorTop).toEqual({ name: "Outlay", pct: 100 });
  });

  it("сводка по ассистенту складывает его столбец и несёт уверенность", () => {
    const matrix = matrixOf([
      ...times(6, { clientMentioned: true, promptId: "p1" }),
      ...times(6, { clientMentioned: false, promptId: "p2" }),
    ]);

    const gpt = matrix.assistants.find((a) => a.id === "chatgpt");
    expect(gpt).toMatchObject({ samples: 12, ratePct: 50, confidence: confidenceFor(12) });
  });

  it("окно измеряется в днях и совпадает с переданным", () => {
    expect(matrixOf([]).windowDays).toBe(28);
  });
});

describe("collapsePromptFacts", () => {
  it("несколько упоминаний одного ответа схлопываются в один ответ", () => {
    const records = collapsePromptFacts([
      {
        responseId: "r1",
        promptId: "p1",
        promptText: "q",
        clusterId: "c1",
        platform: "chatgpt",
        createdAt: IN_WINDOW,
        entityName: "Ledgerbrook",
        isClient: true,
        isCompetitor: false,
      },
      {
        responseId: "r1",
        promptId: "p1",
        promptText: "q",
        clusterId: "c1",
        platform: "chatgpt",
        createdAt: IN_WINDOW,
        entityName: "Outlay",
        isClient: false,
        isCompetitor: true,
      },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      clientMentioned: true,
      competitorsMentioned: ["Outlay"],
    });
  });

  it("ответ без упоминаний остаётся ответом", () => {
    const records = collapsePromptFacts([
      {
        responseId: "r2",
        promptId: "p1",
        promptText: "q",
        clusterId: "c1",
        platform: "gemini",
        createdAt: IN_WINDOW,
        entityName: null,
        isClient: null,
        isCompetitor: null,
      },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.clientMentioned).toBe(false);
  });
});
