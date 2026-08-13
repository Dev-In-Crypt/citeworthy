import { describe, expect, it } from "vitest";
import { measurementBasisFor, REPORT_COPY } from "../copy";
import { buildReportPayload } from "./build";
import type { ReportInputs } from "./build";

/**
 * Отчёт не вправе утверждать больше, чем измерено.
 *
 * До этой проверки оговорка была константой и говорила «several platforms»
 * даже в аудите по одному ChatGPT — то есть клиентский документ содержал
 * ложное утверждение о методе измерения.
 */

function inputs(overrides: Partial<ReportInputs> = {}): ReportInputs {
  return {
    clientName: "Pisto",
    periodStart: new Date("2026-08-01T00:00:00Z"),
    periodEnd: new Date("2026-08-31T00:00:00Z"),
    snapshots: [],
    completedActions: [],
    newCitedUrls: 0,
    newBrandMentions: 0,
    highestImpact: null,
    nextSprint: [],
    caveats: [],
    ...overrides,
  };
}

describe("measurementBasisFor", () => {
  it("одна платформа названа по имени, и сказано, что остальные не мерились", () => {
    const text = measurementBasisFor(["chatgpt"]);

    expect(text).toContain("ChatGPT answers");
    expect(text).toContain("not measured");
    expect(text).not.toContain("several platforms");
  });

  it("повторы одной платформы остаются одной платформой", () => {
    expect(measurementBasisFor(["gemini", "gemini"])).toBe(measurementBasisFor(["gemini"]));
  });

  it("несколько платформ — прежняя формулировка", () => {
    expect(measurementBasisFor(["chatgpt", "perplexity"])).toBe(REPORT_COPY.measurementBasis);
  });

  it("без измерений конкретную платформу не обещаем", () => {
    expect(measurementBasisFor([])).toBe(REPORT_COPY.measurementBasis);
  });

  it("незнакомая платформа подставляется как есть, а не теряется", () => {
    expect(measurementBasisFor(["copilot"])).toContain("copilot answers");
  });
});

describe("оговорка в собранном отчёте", () => {
  it("аудит по одному ChatGPT не говорит «several platforms»", () => {
    const payload = buildReportPayload(inputs({ measuredPlatforms: ["chatgpt"] }));

    expect(payload.caveats[0]).toContain("ChatGPT answers");
    expect(payload.caveats.join(" ")).not.toContain("several platforms");
  });

  it("отчёт по трём платформам говорит про несколько", () => {
    const payload = buildReportPayload(
      inputs({ measuredPlatforms: ["chatgpt", "perplexity", "gemini"] }),
    );

    expect(payload.caveats[0]).toBe(REPORT_COPY.measurementBasis);
  });

  it("оговорка всегда стоит первой и никогда не пропадает", () => {
    const payload = buildReportPayload(
      inputs({ measuredPlatforms: ["chatgpt"], caveats: ["Своя оговорка"] }),
    );

    expect(payload.caveats).toHaveLength(2);
    expect(payload.caveats[1]).toBe("Своя оговорка");
  });
});
