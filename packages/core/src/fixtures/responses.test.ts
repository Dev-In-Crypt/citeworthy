import { describe, expect, it } from "vitest";
import { adapterResultSchema, PLATFORMS } from "../adapters/types";
import { fixturesForPlatform, RESPONSE_FIXTURES } from "./responses";

/** Verify T11: fixtures валидируются против контракта C1 и покрывают edge-cases. */

describe("response fixtures", () => {
  it.each(RESPONSE_FIXTURES)("$id соответствует AdapterResult", (fixture) => {
    expect(() => adapterResultSchema.parse(fixture.result)).not.toThrow();
  });

  it.each([...PLATFORMS])("для %s есть минимум 3 ответа", (platform) => {
    expect(fixturesForPlatform(platform).length).toBeGreaterThanOrEqual(3);
  });

  it("покрывает все обязательные случаи", () => {
    const covered = new Set(RESPONSE_FIXTURES.map((f) => f.covers));
    expect(covered).toContain("brand-mentioned");
    expect(covered).toContain("brand-alias-only");
    expect(covered).toContain("brand-absent");
    expect(covered).toContain("no-citations");
  });

  it("идентификаторы уникальны", () => {
    const ids = RESPONSE_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("случай brand-absent действительно не содержит бренда клиента ни в одном написании", () => {
    const aliases = ["acmecrm", "acme crm", "acme"];

    for (const fixture of RESPONSE_FIXTURES.filter((f) => f.covers === "brand-absent")) {
      const haystack = fixture.result.text.toLowerCase();
      for (const alias of aliases) {
        expect(haystack.includes(alias)).toBe(false);
      }
    }
  });

  it("случай brand-alias-only не содержит каноничного написания", () => {
    for (const fixture of RESPONSE_FIXTURES.filter((f) => f.covers === "brand-alias-only")) {
      expect(fixture.result.text.includes("AcmeCRM")).toBe(false);
      expect(fixture.result.text.toLowerCase()).toContain("acme");
    }
  });

  it("ответ без citations действительно пуст по ссылкам", () => {
    const noCitations = RESPONSE_FIXTURES.filter((f) => f.covers === "no-citations");
    expect(noCitations.length).toBeGreaterThan(0);
    for (const fixture of noCitations) {
      expect(fixture.result.citations).toHaveLength(0);
    }
  });

  it("во всех ответах указана стоимость и версия модели", () => {
    for (const fixture of RESPONSE_FIXTURES) {
      // Инвариант 6: model_version и cost_usd пишутся на каждый response.
      expect(fixture.result.modelVersion).not.toBe("");
      expect(fixture.result.costUsd).toBeGreaterThan(0);
    }
  });
});
