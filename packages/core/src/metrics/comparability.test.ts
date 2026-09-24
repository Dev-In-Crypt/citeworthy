import { describe, expect, it } from "vitest";
import {
  compareAssistantSets,
  shareOverAssistants,
  type Comparability,
  type DeltaAction,
} from "./comparability";

/**
 * Verify: состав периода решает, можно ли сравнивать, и по чему именно.
 *
 * Табличные проверки, как и вся остальная математика проекта: случаев тут
 * шесть, и каждый должен быть виден строкой, а не выведен из кода.
 */

interface Case {
  name: string;
  current: string[];
  previous: string[];
  verdict: Comparability;
  delta: DeltaAction;
  shared: string[];
  added: string[];
  dropped: string[];
  allowDistinguishability: boolean;
}

const CASES: Case[] = [
  {
    name: "одинаковые наборы сравниваются как есть",
    current: ["chatgpt", "perplexity"],
    previous: ["chatgpt", "perplexity"],
    verdict: "same",
    delta: "show",
    shared: ["chatgpt", "perplexity"],
    added: [],
    dropped: [],
    allowDistinguishability: true,
  },
  {
    name: "порядок и повторы на вывод не влияют",
    current: ["perplexity", "chatgpt", "chatgpt"],
    previous: ["chatgpt", "perplexity"],
    verdict: "same",
    delta: "show",
    shared: ["chatgpt", "perplexity"],
    added: [],
    dropped: [],
    allowDistinguishability: true,
  },
  {
    name: "ассистента выключили — набор сузился",
    current: ["chatgpt", "perplexity"],
    previous: ["chatgpt", "claude", "perplexity"],
    verdict: "narrowed",
    delta: "recompute-on-shared",
    shared: ["chatgpt", "perplexity"],
    added: [],
    dropped: ["claude"],
    allowDistinguishability: true,
  },
  {
    name: "ассистента включили — набор расширился",
    current: ["chatgpt", "grok", "perplexity"],
    previous: ["chatgpt", "perplexity"],
    verdict: "widened",
    delta: "recompute-on-shared",
    shared: ["chatgpt", "perplexity"],
    added: ["grok"],
    dropped: [],
    allowDistinguishability: true,
  },
  {
    name: "одного убрали, другого добавили — набор сдвинулся",
    current: ["chatgpt", "grok"],
    previous: ["chatgpt", "claude"],
    verdict: "shifted",
    delta: "recompute-on-shared",
    shared: ["chatgpt"],
    added: ["grok"],
    dropped: ["claude"],
    allowDistinguishability: true,
  },
  {
    name: "общего не осталось вовсе — сравнивать нечего",
    current: ["grok"],
    previous: ["claude"],
    verdict: "disjoint",
    delta: "suppress",
    shared: [],
    added: ["grok"],
    dropped: ["claude"],
    allowDistinguishability: false,
  },
  {
    name: "о прошлом периоде записи нет",
    current: ["chatgpt"],
    previous: [],
    verdict: "unknown",
    delta: "suppress",
    shared: [],
    added: ["chatgpt"],
    dropped: [],
    allowDistinguishability: false,
  },
  {
    name: "о текущем периоде записи нет",
    current: [],
    previous: ["chatgpt"],
    verdict: "unknown",
    delta: "suppress",
    shared: [],
    added: [],
    dropped: ["chatgpt"],
    allowDistinguishability: false,
  },
];

describe("compareAssistantSets", () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const result = compareAssistantSets(testCase.current, testCase.previous);

      expect(result.verdict).toBe(testCase.verdict);
      expect(result.delta).toBe(testCase.delta);
      expect(result.shared).toEqual(testCase.shared);
      expect(result.added).toEqual(testCase.added);
      expect(result.dropped).toEqual(testCase.dropped);
      expect(result.allowDistinguishability).toBe(testCase.allowDistinguishability);
    });
  }

  it("пустые строки не считаются ассистентами", () => {
    expect(compareAssistantSets([""], ["chatgpt"]).verdict).toBe("unknown");
  });

  it("оба пустых — это «нет записи», а не «ничего не менялось»", () => {
    // Свести это в `same` значило бы утверждать сопоставимость там, где мы
    // вообще ничего не видим.
    expect(compareAssistantSets([], []).verdict).toBe("unknown");
  });

  it("списки отсортированы: на них строится текст оговорки", () => {
    const result = compareAssistantSets(["perplexity", "chatgpt"], ["grok", "claude"]);
    expect(result.current).toEqual(["chatgpt", "perplexity"]);
    expect(result.added).toEqual(["chatgpt", "perplexity"]);
    expect(result.dropped).toEqual(["claude", "grok"]);
  });
});

describe("shareOverAssistants", () => {
  const CELLS = [
    { assistantId: "chatgpt", sampleCount: 10, clientVisibilityPct: 30 },
    { assistantId: "perplexity", sampleCount: 10, clientVisibilityPct: 50 },
    { assistantId: "claude", sampleCount: 10, clientVisibilityPct: 0 },
  ];

  it("считает долю только по разрешённым ассистентам", () => {
    const result = shareOverAssistants(CELLS, ["chatgpt", "perplexity"]);
    expect(result.samples).toBe(20);
    expect(result.hits).toBe(8);
    expect(result.pct).toBe(40);
  });

  it("выключенный ассистент с нулём больше не тянет долю вниз", () => {
    // Ровно тот случай, ради которого всё это: клиент не назван в Claude,
    // Claude выключили — и доля «выросла» на десять пунктов сама собой.
    expect(shareOverAssistants(CELLS, ["chatgpt", "perplexity", "claude"]).pct).toBe(26.7);
    expect(shareOverAssistants(CELLS, ["chatgpt", "perplexity"]).pct).toBe(40);
  });

  it("пустой разрешённый набор — показывать нечего, а не ноль", () => {
    const result = shareOverAssistants(CELLS, []);
    expect(result.pct).toBeNull();
    expect(result.samples).toBe(0);
  });

  it("ассистент без ответов не меняет ни числитель, ни знаменатель", () => {
    const withEmpty = [...CELLS, { assistantId: "grok", sampleCount: 0, clientVisibilityPct: 0 }];
    expect(shareOverAssistants(withEmpty, ["chatgpt", "grok"])).toEqual(
      shareOverAssistants(CELLS, ["chatgpt"]),
    );
  });

  it("числитель восстанавливается точно при хранении доли с одним знаком", () => {
    // 1 из 3 хранится как 33.3; обратно должна получиться единица, а не 0.999.
    const result = shareOverAssistants(
      [{ assistantId: "chatgpt", sampleCount: 3, clientVisibilityPct: 33.3 }],
      ["chatgpt"],
    );
    expect(result.hits).toBe(1);
    expect(result.pct).toBe(33.3);
  });

  it("восстановление точно на всём рабочем диапазоне выборок", () => {
    for (let samples = 1; samples <= 200; samples++) {
      for (const hits of [0, 1, Math.floor(samples / 3), Math.floor(samples / 2), samples]) {
        const stored = Math.round((hits / samples) * 1000) / 10;
        const back = shareOverAssistants(
          [{ assistantId: "chatgpt", sampleCount: samples, clientVisibilityPct: stored }],
          ["chatgpt"],
        );
        expect(back.hits).toBe(hits);
      }
    }
  });
});
