import { describe, expect, it } from "vitest";
import { BRIEF_HIGHLIGHT_LIMIT, buildWeeklyBrief, type BriefRow } from "./weekly-brief";
import type { NeedsRow } from "./needs";

/** Строка «что ждёт» в тесте: важен только её текст. */
function need(text: string): NeedsRow {
  return { kind: "opportunity", tone: "needs-you", text, cta: "Review", to: "opportunities" };
}

/**
 * Verify: недельная сводка агентства.
 *
 * Она отвечает на один вопрос — кем заняться сегодня. Поэтому проверяется не
 * только арифметика, но и порядок: клиент с самой весомой находкой обязан
 * стоять первым, а тот, у кого ничего не ждёт, не попадать в список вовсе.
 */

function row(overrides: Partial<BriefRow> = {}): BriefRow {
  return {
    clientId: "c1",
    name: "AcmeCRM",
    needs: [],
    newOpportunities: 0,
    highPriorityOpportunities: 0,
    reportsAwaitingApproval: 0,
    staleActions: 0,
    topOpportunityScore: null,
    ...overrides,
  };
}

describe("buildWeeklyBrief", () => {
  it("на пустом портфеле не выдумывает работы", () => {
    expect(buildWeeklyBrief([])).toMatchObject({
      clients: 0,
      clientsNeedingAttention: 0,
      highlights: [],
    });
  });

  it("считает клиентов, у которых что-то ждёт человека", () => {
    const brief = buildWeeklyBrief([
      row({ clientId: "a", needs: [need("2 high-priority opportunities")], highPriorityOpportunities: 2 }),
      row({ clientId: "b" }),
      row({ clientId: "c", needs: [need("Report to approve")], reportsAwaitingApproval: 1 }),
    ]);

    expect(brief.clients).toBe(3);
    expect(brief.clientsNeedingAttention).toBe(2);
    expect(brief.highPriorityOpportunities).toBe(2);
    expect(brief.reportsAwaitingApproval).toBe(1);
  });

  it("ставит первым клиента с самой весомой находкой", () => {
    const brief = buildWeeklyBrief([
      row({ clientId: "quiet", name: "Quiet", needs: [need("Awaiting first run")], topOpportunityScore: 12 }),
      row({ clientId: "loud", name: "Loud", needs: [need("1 high-priority opportunity")], topOpportunityScore: 88 }),
    ]);

    expect(brief.highlights.map((item) => item.name)).toEqual(["Loud", "Quiet"]);
  });

  it("в подсказке — первая строка, остальные считаются", () => {
    // Карточка обязана помещаться в одну мысль; «и ещё два» честнее, чем
    // список из четырёх пунктов мелким шрифтом.
    const brief = buildWeeklyBrief([
      row({ needs: [need("1 high-priority opportunity"), need("Report to approve"), need("3 actions stalled")] }),
    ]);

    expect(brief.highlights[0]?.headline).toBe("1 high-priority opportunity");
    expect(brief.highlights[0]?.alsoWaiting).toBe(2);
  });

  it("не показывает больше клиентов, чем можно осмотреть за раз", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      row({ clientId: `c${index}`, needs: [need("Awaiting first run")] }),
    );

    expect(buildWeeklyBrief(many).highlights).toHaveLength(BRIEF_HIGHLIGHT_LIMIT);
    // Счётчик при этом честный: он про весь портфель, а не про показанное.
    expect(buildWeeklyBrief(many).clientsNeedingAttention).toBe(20);
  });

  it("клиент без ожидающих пунктов не попадает в список", () => {
    const brief = buildWeeklyBrief([row({ clientId: "fine", topOpportunityScore: 99 })]);
    expect(brief.highlights).toEqual([]);
  });
});
