import { describe, expect, it } from "vitest";
import { diagnose, type CitationFact } from "../diagnosis/source-graph";
import { computePromptMatrix, type PromptResponseRecord } from "../metrics/matrix";
import {
  CLUSTER_GAP_MIN_PP,
  COMPETITOR_GAP_MIN_PP,
  MAX_OPPORTUNITIES,
  SOURCE_GAP_MIN_SHARE_PCT,
  detectClusterGaps,
  detectCompetitorGaps,
  detectContentGaps,
  detectOpportunities,
  detectSourceGaps,
  type ClusterFacts,
  type DetectorInput,
} from "./detectors";

/**
 * Verify: детекторы возможностей.
 *
 * Каждое правило проверяется по своему порогу и по тому, что оно кладёт в
 * доказательство. Отдельно проверяется главное свойство всего набора: на
 * одинаковом входе он обязан давать одинаковый список в одинаковом порядке —
 * иначе его нельзя ни читать, ни сравнивать между прогонами.
 */

const FROM = new Date("2026-07-01T00:00:00Z");
const TO = new Date("2026-07-29T00:00:00Z");

const BANNED = ["proof", "proven", "guarantee", "caused"];

function answers(options: {
  promptId: string;
  clusterId: string;
  clientHits: number;
  competitorHits: number;
  total: number;
  competitor?: string;
}): PromptResponseRecord[] {
  const { promptId, clusterId, clientHits, competitorHits, total } = options;
  const competitor = options.competitor ?? "Rival";

  return Array.from({ length: total }, (_, index) => ({
    responseId: `${promptId}-r${index}`,
    promptId,
    promptText: `question ${promptId}`,
    clusterId,
    platform: "chatgpt" as const,
    createdAt: new Date("2026-07-10T00:00:00Z"),
    clientMentioned: index < clientHits,
    competitorsMentioned: index < competitorHits ? [competitor] : [],
  }));
}

function fact(overrides: Partial<CitationFact> = {}): CitationFact {
  return {
    domain: "example.com",
    sourceType: "editorial",
    clientMentioned: false,
    competitorsMentioned: ["Rival"],
    ...overrides,
  };
}

/** Пять разных доменов — минимум, при котором диагностика делает вывод. */
function filler(count: number): CitationFact[] {
  return Array.from({ length: count }, (_, index) =>
    fact({ domain: `filler${index}.com`, clientMentioned: true, competitorsMentioned: [] }),
  );
}

function cluster(overrides: Partial<ClusterFacts> = {}): ClusterFacts {
  return {
    clusterId: "c1",
    clusterName: "Comparison",
    intent: "comparison",
    promptIds: ["p1"],
    diagnosis: diagnose(filler(5)),
    ...overrides,
  };
}

function input(overrides: Partial<DetectorInput> = {}): DetectorInput {
  const records = answers({
    promptId: "p1",
    clusterId: "c1",
    clientHits: 1,
    competitorHits: 9,
    total: 12,
  });

  return {
    matrix: computePromptMatrix({
      records,
      prompts: [{ id: "p1", text: "question p1", clusterId: "c1" }],
      from: FROM,
      to: TO,
    }),
    movement: [],
    overall: diagnose(filler(5)),
    clusters: [cluster()],
    promptIdsByDomain: new Map(),
    ...overrides,
  };
}

describe("разрыв против конкурента", () => {
  it("срабатывает, когда конкурента называют заметно чаще", () => {
    const found = detectCompetitorGaps(input());

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("competitor_gap");
    expect(found[0]?.evidence).toMatchObject({ competitorName: "Rival", samples: 12 });
    expect(found[0]?.affectedPromptIds).toEqual(["p1"]);
    // На одном вопросе заголовок остаётся конкретным, а не превращается в тему.
    expect(found[0]?.title).toContain("question p1");
  });

  it("молчит, когда отставание меньше порога", () => {
    const records = answers({
      promptId: "p1",
      clusterId: "c1",
      clientHits: 6,
      competitorHits: 7,
      total: 12,
    });

    const found = detectCompetitorGaps(
      input({
        matrix: computePromptMatrix({
          records,
          prompts: [{ id: "p1", text: "question p1", clusterId: "c1" }],
          from: FROM,
          to: TO,
        }),
      }),
    );

    // 8.3 pp — меньше порога: это разброс выборки, а не разрыв.
    expect(COMPETITOR_GAP_MIN_PP).toBeGreaterThan(9);
    expect(found).toEqual([]);
  });

  it("молчит на выборке ниже порога измерения", () => {
    // Два ответа не дают повода ни для какого вывода, каким бы разрыв ни был.
    const records = answers({
      promptId: "p1",
      clusterId: "c1",
      clientHits: 0,
      competitorHits: 2,
      total: 2,
    });

    const found = detectCompetitorGaps(
      input({
        matrix: computePromptMatrix({
          records,
          prompts: [{ id: "p1", text: "question p1", clusterId: "c1" }],
          from: FROM,
          to: TO,
        }),
      }),
    );

    expect(found).toEqual([]);
  });
});

describe("разрыв по источникам", () => {
  const facts = [
    ...Array.from({ length: 8 }, () => fact({ domain: "g2.com", sourceType: "review" })),
    ...filler(5),
  ];

  it("срабатывает на источнике, где есть конкуренты и нет клиента", () => {
    const found = detectSourceGaps(
      input({
        overall: diagnose(facts),
        promptIdsByDomain: new Map([["g2.com", ["p1"]]]),
      }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.sourceDomain).toBe("g2.com");
    expect(found[0]?.competitorNames).toEqual(["Rival"]);
    expect(found[0]?.recommendedActions[0]?.reason.length).toBeGreaterThan(0);
  });

  it("молчит, пока источников слишком мало для вывода", () => {
    // Тот же порог, что и у экрана диагностики: два экрана не должны
    // расходиться в том, достаточно ли данных.
    const found = detectSourceGaps(
      input({ overall: diagnose([fact({ domain: "g2.com" }), fact({ domain: "b.com" })]) }),
    );

    expect(found).toEqual([]);
  });

  it("молчит на источнике с малой долей цитирований", () => {
    const rare = [fact({ domain: "rare.com" }), ...filler(40)];
    const found = detectSourceGaps(input({ overall: diagnose(rare) }));

    const share = 100 / 41;
    expect(share).toBeLessThan(SOURCE_GAP_MIN_SHARE_PCT);
    expect(found).toEqual([]);
  });
});

describe("разрыв по собственному контенту", () => {
  it("срабатывает, когда своих страниц среди цитируемых нет", () => {
    const noOwned = Array.from({ length: 6 }, (_, index) =>
      fact({ domain: `third${index}.com`, clientMentioned: true, competitorsMentioned: [] }),
    );

    const found = detectContentGaps(
      input({ clusters: [cluster({ diagnosis: diagnose(noOwned) })] }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.evidence).toMatchObject({ variant: "no_owned_page" });
  });

  it("срабатывает, когда своя страница цитируется без упоминания бренда", () => {
    const owned = [
      ...Array.from({ length: 4 }, () =>
        fact({ domain: "client.test", sourceType: "owned", competitorsMentioned: [] }),
      ),
      ...filler(5),
    ];

    const found = detectContentGaps(input({ clusters: [cluster({ diagnosis: diagnose(owned) })] }));

    expect(found).toHaveLength(1);
    expect(found[0]?.evidence).toMatchObject({ variant: "owned_without_brand", domain: "client.test" });
    expect(found[0]?.recommendedActions[0]?.actionType).toBe("refresh_page");
  });
});

describe("разрыв по теме", () => {
  const prompts = [
    { id: "p1", text: "question p1", clusterId: "c1" },
    { id: "p2", text: "question p2", clusterId: "c1" },
    { id: "p3", text: "question p3", clusterId: "c2" },
  ];

  function matrixFor(weakHits: number) {
    const records = [
      ...answers({ promptId: "p1", clusterId: "c1", clientHits: weakHits, competitorHits: 0, total: 12 }),
      ...answers({ promptId: "p2", clusterId: "c1", clientHits: weakHits, competitorHits: 0, total: 12 }),
      ...answers({ promptId: "p3", clusterId: "c2", clientHits: 11, competitorHits: 0, total: 12 }),
    ];
    return computePromptMatrix({ records, prompts, from: FROM, to: TO });
  }

  it("срабатывает, когда тема заметно отстаёт от остального набора", () => {
    const found = detectClusterGaps(
      input({
        matrix: matrixFor(1),
        clusters: [cluster({ promptIds: ["p1", "p2"] })],
      }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("cluster_gap");
    expect(found[0]?.affectedPromptIds).toEqual(["p1", "p2"]);
  });

  it("молчит, когда тема идёт вровень с остальными", () => {
    const found = detectClusterGaps(
      input({ matrix: matrixFor(10), clusters: [cluster({ promptIds: ["p1", "p2"] })] }),
    );

    expect(CLUSTER_GAP_MIN_PP).toBeGreaterThan(0);
    expect(found).toEqual([]);
  });

  it("молчит на теме из одного вопроса", () => {
    // Кластер из одного промпта — это промпт, и для него работает своё правило.
    const found = detectClusterGaps(input({ clusters: [cluster({ promptIds: ["p1"] })] }));
    expect(found).toEqual([]);
  });
});

describe("полный набор", () => {
  const facts = [
    ...Array.from({ length: 8 }, () => fact({ domain: "g2.com", sourceType: "review" })),
    ...filler(5),
  ];

  const full = input({
    overall: diagnose(facts),
    clusters: [cluster({ diagnosis: diagnose(facts) })],
    promptIdsByDomain: new Map([["g2.com", ["p1"]]]),
  });

  it("даёт одинаковый список в одинаковом порядке на одинаковом входе", () => {
    const first = detectOpportunities(full);
    const second = detectOpportunities(full);

    expect(first.map((item) => item.dedupeKey)).toEqual(second.map((item) => item.dedupeKey));
    expect(first.map((item) => item.score)).toEqual(second.map((item) => item.score));
  });

  it("сортирует по оценке и не выдаёт больше верхней границы", () => {
    const found = detectOpportunities(full);
    const scores = found.map((item) => item.score);

    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(found.length).toBeLessThanOrEqual(MAX_OPPORTUNITIES);
  });

  it("у каждой возможности есть причина и хотя бы один ход", () => {
    // Инвариант 7 держится схемой; здесь проверяется, что детекторы её
    // действительно проходят, а не что она существует.
    for (const item of detectOpportunities(full)) {
      expect(item.reason.trim().length).toBeGreaterThan(0);
      expect(item.recommendedActions.length).toBeGreaterThan(0);
      for (const recommendation of item.recommendedActions) {
        expect(recommendation.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("не обещает причинности ни в одном сгенерированном тексте", () => {
    for (const item of detectOpportunities(full)) {
      const text = `${item.title} ${item.reason} ${item.recommendedActions
        .map((rec) => `${rec.title} ${rec.reason}`)
        .join(" ")}`.toLowerCase();

      for (const word of BANNED) {
        expect(text).not.toContain(word);
      }
    }
  });

  it("на клиенте без данных не выдумывает ничего", () => {
    const empty = input({
      matrix: computePromptMatrix({ records: [], prompts: [], from: FROM, to: TO }),
      overall: diagnose([]),
      clusters: [],
    });

    expect(detectOpportunities(empty)).toEqual([]);
  });

  it("не показывает отставание темы, если по её вопросам уже есть разрывы", () => {
    // Иначе одна и та же новость приходит дважды и с разными оценками.
    const prompts = [
      { id: "p1", text: "question p1", clusterId: "c1" },
      { id: "p2", text: "question p2", clusterId: "c1" },
      { id: "p3", text: "question p3", clusterId: "c2" },
    ];
    const records = [
      ...answers({ promptId: "p1", clusterId: "c1", clientHits: 1, competitorHits: 10, total: 12 }),
      ...answers({ promptId: "p2", clusterId: "c1", clientHits: 1, competitorHits: 10, total: 12 }),
      ...answers({ promptId: "p3", clusterId: "c2", clientHits: 11, competitorHits: 0, total: 12 }),
    ];

    const found = detectOpportunities(
      input({
        matrix: computePromptMatrix({ records, prompts, from: FROM, to: TO }),
        clusters: [cluster({ promptIds: ["p1", "p2"] })],
      }),
    );

    // Два вопроса одной темы против одного конкурента — одна находка, а не две.
    const competitorGaps = found.filter((item) => item.kind === "competitor_gap");
    expect(competitorGaps).toHaveLength(1);
    expect(competitorGaps[0]?.affectedPromptIds).toEqual(["p1", "p2"]);
    expect(found.filter((item) => item.kind === "cluster_gap")).toEqual([]);
  });
});
