import { describe, expect, it } from "vitest";
import { DIAGNOSIS_COPY } from "../copy";
import {
  computeSourceGap,
  computeSourceMix,
  diagnose,
  MIN_SOURCES_FOR_STATEMENT,
  rankInfluentialSources,
} from "./source-graph";
import type { CitationFact } from "./source-graph";
import type { SourceType } from "../sources/domains";

function fact(overrides: Partial<CitationFact> = {}): CitationFact {
  return {
    domain: "g2.com",
    sourceType: "review",
    clientMentioned: false,
    competitorsMentioned: [],
    ...overrides,
  };
}

describe("computeSourceMix", () => {
  it("считает доли по типам источников", () => {
    const facts = [
      ...Array.from({ length: 3 }, () => fact({ sourceType: "editorial" })),
      ...Array.from({ length: 1 }, () => fact({ sourceType: "review" })),
    ];

    const mix = computeSourceMix(facts);
    expect(mix[0]).toMatchObject({ sourceType: "editorial", citations: 3, sharePct: 75 });
    expect(mix[1]).toMatchObject({ sourceType: "review", citations: 1, sharePct: 25 });
  });

  it("неклассифицированные источники видны отдельно, а не растворяются", () => {
    // Иначе доля «прочего» выглядела бы как осмысленная категория.
    const mix = computeSourceMix([fact({ sourceType: null })]);
    expect(mix[0]?.sourceType).toBe("unclassified");
  });

  it("пустой ввод не делит на ноль", () => {
    expect(computeSourceMix([])).toEqual([]);
  });
});

describe("rankInfluentialSources", () => {
  it("сортирует по частоте цитирования", () => {
    const facts = [
      ...Array.from({ length: 3 }, () => fact({ domain: "g2.com" })),
      ...Array.from({ length: 1 }, () => fact({ domain: "capterra.com" })),
    ];

    const ranked = rankInfluentialSources(facts);
    expect(ranked.map((s) => s.domain)).toEqual(["g2.com", "capterra.com"]);
    expect(ranked[0]?.citations).toBe(3);
  });

  it("клиент считается присутствующим, если упомянут хотя бы в одном ответе с этим источником", () => {
    const ranked = rankInfluentialSources([
      fact({ domain: "g2.com", clientMentioned: false }),
      fact({ domain: "g2.com", clientMentioned: true }),
    ]);

    expect(ranked[0]?.clientPresent).toBe(true);
  });

  it("конкуренты собираются без дублей", () => {
    const ranked = rankInfluentialSources([
      fact({ domain: "g2.com", competitorsMentioned: ["HubSpot", "Close"] }),
      fact({ domain: "g2.com", competitorsMentioned: ["HubSpot"] }),
    ]);

    expect(ranked[0]?.competitorsPresent).toEqual(["Close", "HubSpot"]);
  });

  it("ограничение по количеству соблюдается", () => {
    const facts = Array.from({ length: 40 }, (_, i) => fact({ domain: `site-${i}.example` }));
    expect(rankInfluentialSources(facts, 25)).toHaveLength(25);
  });
});

describe("пример из спека: 16 из 25 против 4 из 25", () => {
  /**
   * Спек (startup-spec §6.2): конкурент присутствует в 16 из 25 влиятельных
   * источников, клиент — в 4. Вывод: разрыв создают сторонние источники.
   */
  const facts: CitationFact[] = Array.from({ length: 25 }, (_, index) => {
    const types: SourceType[] = ["editorial", "review", "directory", "ugc"];
    return fact({
      domain: `source-${String(index).padStart(2, "0")}.example`,
      sourceType: types[index % types.length] ?? "other",
      clientMentioned: index < 4,
      competitorsMentioned: index < 16 ? ["HubSpot"] : [],
    });
  });

  it("присутствие считается ровно как в спеке", () => {
    const gap = computeSourceGap(rankInfluentialSources(facts));

    expect(gap.totalInfluential).toBe(25);
    expect(gap.clientPresentIn).toBe(4);
    expect(gap.competitorPresentIn).toBe(16);
  });

  it("список источников без клиента, но с конкурентами — это и есть очередь работ", () => {
    const gap = computeSourceGap(rankInfluentialSources(facts));

    // Источники 4..15: конкурент есть, клиента нет.
    expect(gap.missingFrom).toHaveLength(12);
    expect(gap.missingFrom.every((s) => !s.clientPresent)).toBe(true);
    expect(gap.missingFrom.every((s) => s.competitorsPresent.length > 0)).toBe(true);
  });

  it("вывод — разрыв создают сторонние источники", () => {
    expect(diagnose(facts).statement).toBe(DIAGNOSIS_COPY.thirdPartyGap);
  });
});

describe("buildStatement — границы", () => {
  it("при преобладании собственных страниц вывод другой", () => {
    const facts = [
      ...Array.from({ length: 6 }, (_, i) =>
        fact({ domain: `own-${i}.example`, sourceType: "owned", clientMentioned: true }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        fact({ domain: `ext-${i}.example`, sourceType: "editorial" }),
      ),
    ];

    expect(diagnose(facts).statement).toBe(DIAGNOSIS_COPY.ownedGap);
  });

  it("на малом числе источников вывод не делается", () => {
    const facts = Array.from({ length: MIN_SOURCES_FOR_STATEMENT - 1 }, (_, i) =>
      fact({ domain: `few-${i}.example` }),
    );

    // Вывод по трём источникам был бы выдумкой, а его понесут клиенту.
    expect(diagnose(facts).statement).toBe(DIAGNOSIS_COPY.inconclusive);
  });

  it("пустые данные не роняют диагностику", () => {
    const diagnosis = diagnose([]);
    expect(diagnosis.statement).toBe(DIAGNOSIS_COPY.inconclusive);
    expect(diagnosis.influential).toEqual([]);
  });
});

describe("формулировки", () => {
  it("не содержат запрещённых слов", () => {
    const banned = /\b(proof|proven|guarantee[d]?|caused)\b/i;

    for (const value of Object.values(DIAGNOSIS_COPY)) {
      expect(value).not.toMatch(banned);
    }
  });

  it("вывод сопровождается пометкой об источнике данных", () => {
    expect(diagnose([]).evidenceNote).toBe(DIAGNOSIS_COPY.evidenceNote);
  });
});
