import { describe, expect, it } from "vitest";
import { ASSISTANTS } from "../adapters/catalogue";
import { MIN_SAMPLES_PER_CELL } from "./visibility";
import { confidenceFor } from "./confidence";
import { compareAssistantSets } from "./comparability";
import { isDistinguishable } from "./interval";
import {
  collapsePromptFacts,
  computeMovement,
  computePromptMatrix,
  measuredAssistants,
  restrictToAssistants,
  type PromptResponseRecord,
} from "./matrix";

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

    const copilot = cell(matrix, "p1", "copilot");
    expect(copilot).toMatchObject({ measurable: false, samples: 0, ratePct: null });
  });

  it("неизмеряемый ассистент не попадает ни в один знаменатель", () => {
    const matrix = matrixOf(times(6, { clientMentioned: true }));

    expect(matrix.totals.samples).toBe(6);
    expect(matrix.totals.ratePct).toBe(100);

    // Число берётся из каталога, а не вписано: список поверхностей растёт по
    // мере того, как продукт признаёт новые, и тест не должен падать от того,
    // что мы честно добавили ещё одну неизмеряемую.
    const unmeasured = matrix.assistants.filter((a) => !a.measurable);
    expect(unmeasured).toHaveLength(ASSISTANTS.filter((a) => !a.measurable).length);
    expect(unmeasured.length).toBeGreaterThan(0);
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

describe("сравнение окон с разным составом ассистентов", () => {
  const PREVIOUS_FROM = new Date("2026-06-18T00:00:00.000Z");
  const PREVIOUS_AT = new Date("2026-07-01T12:00:00.000Z");

  /**
   * Тот самый случай, ради которого всё это.
   *
   * Клиента называют в трети ответов ChatGPT и ни разу — в Claude. Агентство
   * выключает Claude. У клиента не изменилось ничего, но знаменатель стал
   * вдвое меньше, и доля «выросла» с 15% до 30%.
   */
  function windows() {
    // Размер окна взят настоящий, а не символический: на пятидесяти ответах
    // интервалы ещё перекрываются, и ловушка не видна. Именно на объёме,
    // который набирает работающий клиент, она и захлопывается.
    const previousRecords = [
      ...times(50, { clientMentioned: true, createdAt: PREVIOUS_AT }),
      ...times(100, { clientMentioned: false, createdAt: PREVIOUS_AT }),
      ...times(150, { platform: "claude", clientMentioned: false, createdAt: PREVIOUS_AT }),
    ];
    const currentRecords = [
      ...times(50, { clientMentioned: true }),
      ...times(100, { clientMentioned: false }),
    ];

    const previousInput = {
      records: previousRecords,
      prompts: PROMPTS,
      from: PREVIOUS_FROM,
      to: FROM,
    };
    const currentInput = { records: currentRecords, prompts: PROMPTS, from: FROM, to: TO };

    return { previousInput, currentInput };
  }

  it("наивное сравнение показало бы рост, которого не было", () => {
    const { previousInput, currentInput } = windows();
    const naive = computePromptMatrix(currentInput).totals.ratePct!;
    const before = computePromptMatrix(previousInput).totals.ratePct!;

    expect(before).toBeCloseTo(16.7, 1);
    expect(naive).toBeCloseTo(33.3, 1);
    expect(naive - before).toBeGreaterThan(15);
  });

  it("и выборка подтвердила бы этот рост как настоящий", () => {
    const { previousInput, currentInput } = windows();
    // Проверка «отличимо ли от шума» срабатывает задом наперёд: скачок
    // крупный, интервалы не пересекаются, и продукт сказал бы «не случайность».
    expect(
      isDistinguishable(
        computePromptMatrix(currentInput).totals.interval,
        computePromptMatrix(previousInput).totals.interval,
      ),
    ).toBe(true);
  });

  it("по общему набору роста нет", () => {
    const { previousInput, currentInput } = windows();
    const current = computePromptMatrix(currentInput);
    const previous = computePromptMatrix(previousInput);

    const basis = compareAssistantSets(measuredAssistants(current), measuredAssistants(previous));
    expect(basis.verdict).toBe("narrowed");
    expect(basis.dropped).toEqual(["claude"]);
    expect(basis.shared).toEqual(["chatgpt"]);

    const sharedNow = restrictToAssistants(currentInput, basis.shared);
    const sharedBefore = restrictToAssistants(previousInput, basis.shared);

    expect(sharedNow.totals.ratePct).toBe(sharedBefore.totals.ratePct);
    expect(isDistinguishable(sharedNow.totals.interval, sharedBefore.totals.interval)).toBe(false);
  });

  it("движение по вопросам тоже считается по общему набору", () => {
    const { previousInput, currentInput } = windows();
    const basis = compareAssistantSets(
      measuredAssistants(computePromptMatrix(currentInput)),
      measuredAssistants(computePromptMatrix(previousInput)),
    );

    const movement = computeMovement(
      restrictToAssistants(currentInput, basis.shared),
      restrictToAssistants(previousInput, basis.shared),
    );

    expect(movement.find((m) => m.promptId === "p1")?.deltaPp).toBe(0);
  });

  it("без общих ассистентов сравнивать нечего — не ноль, а пусто", () => {
    const previousInput = {
      records: times(30, { platform: "claude", clientMentioned: true, createdAt: PREVIOUS_AT }),
      prompts: PROMPTS,
      from: PREVIOUS_FROM,
      to: FROM,
    };
    const currentInput = {
      records: times(30, { platform: "grok", clientMentioned: false }),
      prompts: PROMPTS,
      from: FROM,
      to: TO,
    };

    const basis = compareAssistantSets(
      measuredAssistants(computePromptMatrix(currentInput)),
      measuredAssistants(computePromptMatrix(previousInput)),
    );
    expect(basis.verdict).toBe("disjoint");

    const movement = computeMovement(
      restrictToAssistants(currentInput, basis.shared),
      restrictToAssistants(previousInput, basis.shared),
    );
    expect(movement.every((m) => m.deltaPp === null)).toBe(true);
  });
});
