import { describe, expect, it } from "vitest";
import type { PortfolioRow } from "@repo/db";
import { droppedAssistants, needsFor } from "./needs";

/**
 * Расписание переживает и смену тарифа, и решение перестать измерять
 * платформу: строку с ним никто не переписывает.
 *
 * Экран измерения об этом говорит, но агентство доходит туда по одному
 * клиенту и может месяц не знать, что часть книги измеряется уже, чем
 * настроено. Поэтому то же расхождение поднимается в список клиентов.
 */

function row(patch: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    clientId: "c1",
    name: "Ledgerbrook",
    domain: "ledgerbrook.test",
    status: "active",
    visibilityPct: 31,
    competitorVisibility: {},
    sampleCount: 216,
    sufficient: true,
    deltaPp: null,
    latestAssistants: ["chatgpt"],
    previousAssistants: ["chatgpt"],
    scheduledAssistants: ["chatgpt", "perplexity", "grok"],
    openActions: 0,
    staleActions: 0,
    reportsAwaitingApproval: 0,
    lastRunAt: new Date("2026-09-20T00:00:00.000Z"),
    openOpportunities: 0,
    highPriorityOpportunities: 0,
    newOpportunities: 0,
    topOpportunityScore: null,
    ...patch,
  } as PortfolioRow;
}

const STARTER = ["chatgpt", "perplexity", "grok"];

describe("needsFor: расписание против тарифа", () => {
  it("молчит, когда всё настроенное измеряется", () => {
    expect(needsFor(row(), STARTER).filter((n) => n.cta === "Fix schedule")).toEqual([]);
  });

  it("называет ассистента, которого тариф больше не даёт", () => {
    const needs = needsFor(
      row({ scheduledAssistants: ["chatgpt", "claude"] }),
      STARTER,
    );

    const dropped = needs.find((n) => n.cta === "Fix schedule");
    expect(dropped?.text).toBe("1 assistant in the schedule is no longer measured");
    expect(dropped?.tone).toBe("needs-you");
    expect(dropped?.to).toBe("measure");
  });

  it("считает всех выпавших, а не только первого", () => {
    const needs = needsFor(
      row({ scheduledAssistants: ["chatgpt", "claude", "gemini"] }),
      STARTER,
    );

    expect(needs.find((n) => n.cta === "Fix schedule")?.text).toBe(
      "2 assistants in the schedule are no longer measured",
    );
  });

  it("платформа, которую перестали измерять вовсе, считается так же", () => {
    // Для агентства это одно и то же: настроено, но не спрашивается.
    // Разница в причине, а не в том, что надо сделать.
    const needs = needsFor(
      row({ scheduledAssistants: ["chatgpt", "gemini"] }),
      ["chatgpt", "perplexity", "grok", "claude"],
    );

    expect(needs.find((n) => n.cta === "Fix schedule")?.text).toContain("1 assistant");
  });

  it("без прав молчит, а не поднимает тревогу", () => {
    /**
     * Пустой список разрешённых означает «ещё не знаем». Решить на этом,
     * что настроенного нет в тарифе, значит показать тревогу всем сразу.
     */
    expect(needsFor(row({ scheduledAssistants: ["chatgpt", "claude"] }), [])).toEqual(
      needsFor(row({ scheduledAssistants: [] }), []),
    );
  });

  it("клиент без расписания сюда не попадает", () => {
    const needs = needsFor(row({ scheduledAssistants: [], lastRunAt: null }), STARTER);

    expect(needs.find((n) => n.cta === "Fix schedule")).toBeUndefined();
    // Ему нужно другое, и это уже сказано отдельной строкой.
    expect(needs.find((n) => n.text === "Awaiting first run")).toBeDefined();
  });
});

describe("droppedAssistants", () => {
  it("возвращает именно тех, кого расписание просит, а тариф не даёт", () => {
    expect(
      droppedAssistants({ scheduledAssistants: ["chatgpt", "claude", "gemini"] }, STARTER),
    ).toEqual(["claude", "gemini"]);
  });

  it("без прав возвращает пусто, а не весь набор", () => {
    expect(droppedAssistants({ scheduledAssistants: ["chatgpt", "claude"] }, [])).toEqual([]);
  });

  it("считает то же, что и строка в списке клиентов", () => {
    // Справочник клиентов показывает число, экран «Сегодня» — фразу. Оба
    // берут его отсюда: две формулировки одного факта однажды разойдутся.
    const r = row({ scheduledAssistants: ["chatgpt", "claude"] });
    expect(droppedAssistants(r, STARTER)).toHaveLength(1);
    expect(needsFor(r, STARTER).find((n) => n.cta === "Fix schedule")).toBeDefined();
  });
});
