import { describe, expect, it } from "vitest";
import { findAllAliasOccurrences, highlightMentions } from "./highlight";
import { RESPONSE_FIXTURES } from "../fixtures/responses";
import type { EntityDictionary } from "./types";

const ACME: EntityDictionary = {
  brandNames: ["AcmeCRM", "Acme CRM", "Acme"],
  competitorNames: ["HubSpot", "Pipedrive", "Close"],
};

describe("findAllAliasOccurrences", () => {
  it("находит все вхождения, а не только первое", () => {
    expect(findAllAliasOccurrences("HubSpot, then HubSpot again", "HubSpot")).toHaveLength(2);
  });

  it("уважает границы слова", () => {
    expect(findAllAliasOccurrences("SuperHubSpotPlus", "HubSpot")).toHaveLength(0);
  });

  it("правило собственных имён работает и здесь", () => {
    // Та же логика, что в парсере: иначе подсветка и метрика разошлись бы.
    expect(findAllAliasOccurrences("close the deal", "Close")).toHaveLength(0);
    expect(findAllAliasOccurrences("Close is a CRM", "Close")).toHaveLength(1);
  });
});

describe("highlightMentions", () => {
  it("склеивание сегментов возвращает исходный текст без потерь", () => {
    for (const fixture of RESPONSE_FIXTURES) {
      const segments = highlightMentions(fixture.result.text, ACME);
      expect(segments.map((s) => s.text).join("")).toBe(fixture.result.text);
    }
  });

  it("помечает клиента и конкурентов разными типами", () => {
    const segments = highlightMentions("AcmeCRM competes with HubSpot.", ACME);

    expect(segments.find((s) => s.text === "AcmeCRM")?.kind).toBe("client");
    expect(segments.find((s) => s.text === "HubSpot")?.kind).toBe("competitor");
  });

  it("длинный алиас подсвечивается целиком, а не распадается", () => {
    const segments = highlightMentions("We use Acme CRM daily.", ACME);
    const highlighted = segments.filter((s) => s.kind !== "plain");

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.text).toBe("Acme CRM");
    // Каноническое имя в подсказке, даже если в тексте другое написание.
    expect(highlighted[0]?.entity).toBe("AcmeCRM");
  });

  it("подсвечивает каждое вхождение, а не только первое", () => {
    const segments = highlightMentions("HubSpot, Pipedrive, then HubSpot again.", ACME);
    expect(segments.filter((s) => s.entity === "HubSpot")).toHaveLength(2);
  });

  it("текст без упоминаний остаётся одним обычным сегментом", () => {
    const segments = highlightMentions("Asana and ClickUp are project tools.", ACME);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("plain");
  });

  it("пустой словарь ничего не подсвечивает", () => {
    const segments = highlightMentions("AcmeCRM and HubSpot", {
      brandNames: [],
      competitorNames: [],
    });
    expect(segments.every((s) => s.kind === "plain")).toBe(true);
  });

  it("пустой текст не роняет разбор", () => {
    expect(highlightMentions("", ACME)).toEqual([]);
  });

  it("на fixture с брендом под alias подсветка клиента есть", () => {
    const fixture = RESPONSE_FIXTURES.find((f) => f.covers === "brand-alias-only");
    const segments = highlightMentions(fixture!.result.text, ACME);

    expect(segments.some((s) => s.kind === "client")).toBe(true);
  });

  it("на fixture без бренда подсветки клиента нет", () => {
    for (const fixture of RESPONSE_FIXTURES.filter((f) => f.covers === "brand-absent")) {
      const segments = highlightMentions(fixture.result.text, ACME);
      expect(segments.some((s) => s.kind === "client")).toBe(false);
    }
  });
});
