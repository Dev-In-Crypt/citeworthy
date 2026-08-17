import { describe, expect, it } from "vitest";
import { BRIEF_HIGHLIGHT_LIMIT, buildWeeklyBrief, type BriefRow } from "./weekly-brief";

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
      row({ clientId: "a", needs: ["2 high-priority opportunities"], highPriorityOpportunities: 2 }),
      row({ clientId: "b" }),
      row({ clientId: "c", needs: ["Report to approve"], reportsAwaitingApproval: 1 }),
    ]);

    expect(brief.clients).toBe(3);
    expect(brief.clientsNeedingAttention).toBe(2);
    expect(brief.highPriorityOpportunities).toBe(2);
    expect(brief.reportsAwaitingApproval).toBe(1);
  });

  it("ставит первым клиента с самой весомой находкой", () => {
    const brief = buildWeeklyBrief([
      row({ clientId: "quiet", name: "Quiet", needs: ["Awaiting first run"], topOpportunityScore: 12 }),
      row({ clientId: "loud", name: "Loud", needs: ["1 high-priority opportunity"], topOpportunityScore: 88 }),
    ]);

    expect(brief.highlights.map((item) => item.name)).toEqual(["Loud", "Quiet"]);
  });

  it("в подсказке — первая строка, остальные считаются", () => {
    // Карточка обязана помещаться в одну мысль; «и ещё два» честнее, чем
    // список из четырёх пунктов мелким шрифтом.
    const brief = buildWeeklyBrief([
      row({ needs: ["1 high-priority opportunity", "Report to approve", "3 actions stalled"] }),
    ]);

    expect(brief.highlights[0]?.headline).toBe("1 high-priority opportunity");
    expect(brief.highlights[0]?.alsoWaiting).toBe(2);
  });

  it("не показывает больше клиентов, чем можно осмотреть за раз", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      row({ clientId: `c${index}`, needs: ["Awaiting first run"] }),
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
