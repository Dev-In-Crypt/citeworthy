import { describe, expect, it, vi } from "vitest";
import { RESPONSE_FIXTURES } from "../fixtures/responses";
import { findAlias, matchEntities, mentionsFromText } from "./matcher";
import { domainOf, mergeMentions, parseResponse } from "./parse";
import type { EntityDictionary, LlmExtractor, ParsedMention } from "./types";

/**
 * Verify T18. Самый защищённый тестами код проекта: ошибка здесь не падает,
 * а тихо искажает visibility, и заметить это по дашборду невозможно.
 */

const ACME: EntityDictionary = {
  brandNames: ["AcmeCRM", "Acme CRM", "Acme"],
  competitorNames: ["HubSpot", "Pipedrive", "Close", "Salesforce"],
};

describe("findAlias — границы слова", () => {
  const cases: [string, string, boolean][] = [
    ["We recommend AcmeCRM for startups.", "AcmeCRM", true],
    ["AcmeCRM, Pipedrive and Close.", "AcmeCRM", true],
    ["Try AcmeCRM's API.", "AcmeCRM", true],
    ["The AcmeCRM-based workflow", "AcmeCRM", true],
    // Подстрока внутри другого слова упоминанием не является.
    ["SuperAcmeCRMPlus is unrelated", "AcmeCRM", false],
    ["acmecrmx", "AcmeCRM", false],
  ];

  it.each(cases)("%s ⊃ %s = %s", (text, alias, expected) => {
    expect(findAlias(text, alias) !== -1).toBe(expected);
  });

  it("бренд с заглавной не находится в обычном слове того же написания", () => {
    // Конкурент Close — обычное английское слово. Без правила собственных имён
    // его visibility росла бы на фразах вроде «close the deal».
    expect(findAlias("You should close the deal quickly.", "Close")).toBe(-1);
    expect(findAlias("Close is built around calling.", "Close")).toBe(0);
  });

  it("нечувствителен к регистру только для алиасов без заглавных", () => {
    expect(findAlias("we use acmecrm daily", "acmecrm")).toBeGreaterThanOrEqual(0);
    expect(findAlias("we use acmecrm daily", "AcmeCRM")).toBe(-1);
  });

  it("пустой алиас не находится нигде", () => {
    expect(findAlias("anything", "")).toBe(-1);
    expect(findAlias("anything", "   ")).toBe(-1);
  });
});

describe("matchEntities", () => {
  it("возвращает каноническое имя, а не то, как написано в ответе", () => {
    const hits = matchEntities("Teams often pick Acme CRM over HubSpot.", ACME);
    const client = hits.find((h) => h.isClient);

    expect(client?.canonical).toBe("AcmeCRM");
    expect(client?.matchedAlias).toBe("Acme CRM");
  });

  it("длинный алиас важнее короткого", () => {
    const hits = matchEntities("Acme CRM is the product.", ACME);
    expect(hits.find((h) => h.isClient)?.matchedAlias).toBe("Acme CRM");
  });

  it("одна сущность даёт одно упоминание, сколько бы раз ни повторялась", () => {
    const hits = matchEntities("HubSpot, then HubSpot again, and HubSpot once more.", ACME);
    expect(hits.filter((h) => h.canonical === "HubSpot")).toHaveLength(1);
  });

  it("порядок соответствует появлению в тексте", () => {
    const mentions = mentionsFromText("Pipedrive, then AcmeCRM, then HubSpot.", ACME);
    expect(mentions.map((m) => m.name)).toEqual(["Pipedrive", "AcmeCRM", "HubSpot"]);
    expect(mentions.map((m) => m.position)).toEqual([1, 2, 3]);
  });

  it("не находит бренд там, где его нет", () => {
    const mentions = mentionsFromText("Asana, Monday.com and ClickUp are project tools.", ACME);
    expect(mentions).toHaveLength(0);
  });

  it("пустой словарь не даёт упоминаний", () => {
    const mentions = mentionsFromText("AcmeCRM and HubSpot", { brandNames: [], competitorNames: [] });
    expect(mentions).toHaveLength(0);
  });
});

describe("domainOf", () => {
  const cases: [string, string][] = [
    ["https://www.g2.com/categories/crm", "g2.com"],
    ["https://G2.com/x", "g2.com"],
    ["https://blog.hubspot.com/sales/best-crm", "blog.hubspot.com"],
    ["not a url", ""],
  ];

  it.each(cases)("%s -> %s", (url, expected) => {
    expect(domainOf(url)).toBe(expected);
  });
});

describe("parseResponse на fixtures", () => {
  it.each(RESPONSE_FIXTURES)("$id разбирается без потери citations", async (fixture) => {
    const parsed = await parseResponse(fixture.result.text, fixture.result.citations, ACME);

    // Ни одна ссылка не должна потеряться: на них строится source graph (T32).
    expect(parsed.citationUrls).toHaveLength(fixture.result.citations.length);
  });

  it("находит клиента там, где он упомянут явно", async () => {
    const fixture = RESPONSE_FIXTURES.find((f) => f.covers === "brand-mentioned");
    const parsed = await parseResponse(fixture!.result.text, fixture!.result.citations, ACME);

    expect(parsed.mentions.some((m) => m.isClient)).toBe(true);
  });

  it("находит клиента, упомянутого только под alias", async () => {
    for (const fixture of RESPONSE_FIXTURES.filter((f) => f.covers === "brand-alias-only")) {
      const parsed = await parseResponse(fixture.result.text, fixture.result.citations, ACME);

      expect(parsed.mentions.some((m) => m.isClient && m.name === "AcmeCRM")).toBe(true);
    }
  });

  it("не даёт ложных срабатываний там, где клиента нет", async () => {
    for (const fixture of RESPONSE_FIXTURES.filter((f) => f.covers === "brand-absent")) {
      const parsed = await parseResponse(fixture.result.text, fixture.result.citations, ACME);

      expect(parsed.mentions.some((m) => m.isClient)).toBe(false);
    }
  });

  it("ответ без ссылок не порождает citations", async () => {
    const fixture = RESPONSE_FIXTURES.find((f) => f.covers === "no-citations");
    const parsed = await parseResponse(fixture!.result.text, fixture!.result.citations, ACME);

    expect(parsed.citationUrls).toHaveLength(0);
  });

  it("дубли ссылок схлопываются", async () => {
    const parsed = await parseResponse(
      "AcmeCRM",
      [
        { url: "https://g2.com/crm", title: "G2" },
        { url: "https://G2.com/crm" },
        { url: "https://capterra.com/crm" },
      ],
      ACME,
    );

    expect(parsed.citationUrls).toHaveLength(2);
  });
});

describe("уточнение моделью", () => {
  const llmSaysNegative: LlmExtractor = {
    extract: (): Promise<ParsedMention[]> =>
      Promise.resolve([
        { name: "AcmeCRM", position: 1, sentiment: "negative", isClient: true, isCompetitor: false },
      ]),
  };

  it("модель уточняет тональность", async () => {
    const parsed = await parseResponse("AcmeCRM is slow.", [], ACME, { llm: llmSaysNegative });
    expect(parsed.mentions.find((m) => m.isClient)?.sentiment).toBe("negative");
  });

  it("модель не может добавить сущность, которой нет в словаре", () => {
    const invented: ParsedMention[] = [
      { name: "Freshsales", position: 1, sentiment: "positive", isClient: false, isCompetitor: true },
    ];
    const merged = mergeMentions(mentionsFromText("AcmeCRM only.", ACME), invented);

    // Иначе visibility зависела бы от галлюцинаций модели-парсера.
    expect(merged.map((m) => m.name)).toEqual(["AcmeCRM"]);
  });

  it("падение модели не роняет разбор — состав упоминаний уже известен", async () => {
    const broken: LlmExtractor = { extract: vi.fn().mockRejectedValue(new Error("timeout")) };
    const parsed = await parseResponse("AcmeCRM and HubSpot.", [], ACME, { llm: broken });

    expect(parsed.mentions.map((m) => m.name)).toEqual(["AcmeCRM", "HubSpot"]);
    expect(parsed.mentions.every((m) => m.sentiment === "neutral")).toBe(true);
  });
});
