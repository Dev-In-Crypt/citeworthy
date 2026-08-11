import { describe, expect, it } from "vitest";
import {
  buildRecommendations,
  makeRecommendation,
  recommendMissingSources,
  recommendOwnedPage,
  recommendOwnedRefresh,
} from "./recommendations";
import { diagnose } from "./source-graph";
import type { CitationFact, InfluentialSource } from "./source-graph";

function source(overrides: Partial<InfluentialSource> = {}): InfluentialSource {
  return {
    domain: "g2.com",
    sourceType: "review",
    citations: 10,
    sharePct: 20,
    clientPresent: false,
    competitorsPresent: ["HubSpot"],
    ...overrides,
  };
}

function fact(overrides: Partial<CitationFact> = {}): CitationFact {
  return {
    domain: "g2.com",
    sourceType: "review",
    clientMentioned: false,
    competitorsMentioned: [],
    ...overrides,
  };
}

describe("инвариант: рекомендация без reason невозможна", () => {
  it("пустой reason отвергается схемой", () => {
    expect(() =>
      makeRecommendation({
        actionType: "create_page",
        title: "Something",
        reason: "",
        estimatedImpact: "medium",
        effort: "medium",
        rule: "test",
      }),
    ).toThrow();
  });

  it("каждая сгенерированная рекомендация несёт непустой reason и правило", () => {
    const diagnosis = diagnose([
      ...Array.from({ length: 6 }, (_, i) =>
        fact({ domain: `s-${i}.example`, competitorsMentioned: ["HubSpot"] }),
      ),
    ]);

    const recommendations = buildRecommendations(diagnosis);
    expect(recommendations.length).toBeGreaterThan(0);

    for (const recommendation of recommendations) {
      // Принцип 6 спека: рекомендация без «почему» бесполезна агентству,
      // потому что именно «почему» оно перескажет своему клиенту.
      expect(recommendation.reason.trim()).not.toBe("");
      expect(recommendation.rule.trim()).not.toBe("");
    }
  });
});

describe("правило 1: клиента нет там, где есть конкуренты", () => {
  it("тип действия зависит от типа источника", () => {
    const recommendations = recommendMissingSources([
      source({ domain: "g2.com", sourceType: "review" }),
      source({ domain: "forbes.com", sourceType: "editorial" }),
      source({ domain: "producthunt.com", sourceType: "directory" }),
      source({ domain: "reddit.com", sourceType: "ugc" }),
    ]);

    expect(recommendations.map((r) => r.actionType)).toEqual([
      "review_platform",
      "pr_editorial",
      "source_outreach",
      "ugc_community",
    ]);
  });

  it("reason содержит долю цитирований и имена конкурентов", () => {
    const [recommendation] = recommendMissingSources([
      source({ sharePct: 23, citations: 12, competitorsPresent: ["HubSpot", "Close"] }),
    ]);

    expect(recommendation?.reason).toContain("23%");
    expect(recommendation?.reason).toContain("12 citations");
    expect(recommendation?.reason).toContain("HubSpot, Close");
  });

  it("источник, где клиент уже есть, рекомендацию не порождает", () => {
    expect(recommendMissingSources([source({ clientPresent: true })])).toHaveLength(0);
  });

  it("источник без конкурентов не порождает рекомендацию", () => {
    // Отсутствие всех — это не разрыв, а просто нерелевантный источник.
    expect(recommendMissingSources([source({ competitorsPresent: [] })])).toHaveLength(0);
  });

  it("собственный домен не превращается в outreach", () => {
    expect(recommendMissingSources([source({ sourceType: "owned" })])).toHaveLength(0);
  });

  it("влиятельность источника поднимает ожидаемый эффект", () => {
    const high = recommendMissingSources([source({ sharePct: 30 })])[0];
    const low = recommendMissingSources([source({ sharePct: 2 })])[0];

    expect(high?.estimatedImpact).toBe("high");
    expect(low?.estimatedImpact).toBe("low");
  });
});

describe("правило 2: нет ни одной собственной страницы в цитатах", () => {
  it("рекомендует создать страницу", () => {
    const diagnosis = diagnose(
      Array.from({ length: 6 }, (_, i) => fact({ domain: `s-${i}.example` })),
    );

    const [recommendation] = recommendOwnedPage(diagnosis);
    expect(recommendation?.actionType).toBe("create_page");
    expect(recommendation?.reason).toContain("own domain");
  });

  it("не срабатывает, если собственная страница уже цитируется", () => {
    const diagnosis = diagnose([
      fact({ domain: "acmecrm.test", sourceType: "owned" }),
      fact({ domain: "g2.com" }),
    ]);

    expect(recommendOwnedPage(diagnosis)).toHaveLength(0);
  });

  it("не срабатывает при отсутствии данных", () => {
    // Иначе на пустом клиенте продукт советовал бы «создать страницу»
    // без единого измерения — это выглядит как совет, но им не является.
    expect(recommendOwnedPage(diagnose([]))).toHaveLength(0);
  });
});

describe("правило 3: своя страница цитируется, но бренд в ответе не звучит", () => {
  it("рекомендует обновить содержание, а не создавать новое", () => {
    const [recommendation] = recommendOwnedRefresh([
      source({ domain: "acmecrm.test", sourceType: "owned", clientPresent: false, citations: 5 }),
    ]);

    expect(recommendation?.actionType).toBe("refresh_page");
    expect(recommendation?.reason).toContain("5 times");
  });

  it("не срабатывает, если клиент в этих ответах упомянут", () => {
    expect(
      recommendOwnedRefresh([
        source({ domain: "acmecrm.test", sourceType: "owned", clientPresent: true }),
      ]),
    ).toHaveLength(0);
  });
});

describe("buildRecommendations", () => {
  it("сортирует по ожидаемому эффекту", () => {
    const diagnosis = diagnose([
      ...Array.from({ length: 20 }, () =>
        fact({ domain: "big.example", competitorsMentioned: ["HubSpot"] }),
      ),
      ...Array.from({ length: 1 }, () =>
        fact({ domain: "small.example", competitorsMentioned: ["HubSpot"] }),
      ),
      ...Array.from({ length: 5 }, (_, i) => fact({ domain: `mid-${i}.example` })),
    ]);

    const impacts = buildRecommendations(diagnosis).map((r) => r.estimatedImpact);
    expect(impacts[0]).toBe("high");
  });

  it("на пустых данных возвращает пустой список, а не выдумывает работу", () => {
    expect(buildRecommendations(diagnose([]))).toEqual([]);
  });

  it("clusterId прокидывается в каждую рекомендацию", () => {
    const diagnosis = diagnose(
      Array.from({ length: 6 }, (_, i) =>
        fact({ domain: `s-${i}.example`, competitorsMentioned: ["HubSpot"] }),
      ),
    );

    const recommendations = buildRecommendations(diagnosis, "cluster-42");
    expect(recommendations.every((r) => r.clusterId === "cluster-42")).toBe(true);
  });
});
