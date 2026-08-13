import { describe, expect, it } from "vitest";
import { ACTION_TYPES } from "../diagnosis/recommendations";
import { PLAYBOOKS, playbookFor } from "./playbooks";
import { buildBriefFromTemplate, TemplateBriefWriter } from "./brief";
import type { BriefInput } from "./brief";

/**
 * Verify T81: рекомендация разворачивается в рабочее задание.
 *
 * Проверяется не красота текста, а то, ради чего бриф существует: у каждого
 * типа работ есть шаги и проверяемый признак готовности, а числа измерения
 * доезжают до исполнителя.
 */

function input(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    actionType: "review_platform",
    title: "Get the client covered on g2.com",
    reason:
      "g2.com is cited in 18% of answers here (14 citations). NeoAttack appear in those answers; the client does not.",
    sourceDomain: "g2.com",
    evidence: {
      sourceType: "review",
      citations: 14,
      sharePct: 18,
      competitorsPresent: ["NeoAttack", "JohnAppleman"],
    },
    ...overrides,
  };
}

describe("плейбуки", () => {
  it("покрывают все типы работ", () => {
    expect(Object.keys(PLAYBOOKS).sort()).toEqual([...ACTION_TYPES].sort());
  });

  for (const actionType of ACTION_TYPES) {
    it(`${actionType}: есть шаги и проверяемый признак готовности`, () => {
      const playbook = playbookFor(actionType);

      expect(playbook.steps.length).toBeGreaterThan(0);
      // Без признака готовности задание нельзя закрыть, не споря о том,
      // сделано оно или нет.
      expect(playbook.acceptance.length).toBeGreaterThan(0);
      for (const line of [...playbook.steps, ...playbook.acceptance]) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
    });
  }
});

describe("бриф", () => {
  it("несёт цель, причину, шаги и признак готовности", () => {
    const brief = buildBriefFromTemplate(input());

    expect(brief.objective).toContain("g2.com");
    expect(brief.why).toBe(input().reason);
    expect(brief.steps.length).toBeGreaterThan(0);
    expect(brief.acceptance.length).toBeGreaterThan(0);
  });

  it("числа измерения доезжают до исполнителя", () => {
    const brief = buildBriefFromTemplate(input());

    expect(brief.context.join(" ")).toContain("18%");
    expect(brief.context.join(" ")).toContain("14 citations");
    expect(brief.context.join(" ")).toContain("NeoAttack");
  });

  it("детерминирован: одинаковый вход — одинаковый бриф", () => {
    expect(buildBriefFromTemplate(input())).toEqual(buildBriefFromTemplate(input()));
  });

  it("без доказательств контекст пуст, а не выдуман", () => {
    const brief = buildBriefFromTemplate(
      input({ evidence: null, sourceDomain: null, actionType: "technical_fix" }),
    );

    expect(brief.context).toEqual([]);
    expect(brief.steps.length).toBeGreaterThan(0);
  });

  it("несколько кластеров названы явно", () => {
    const brief = buildBriefFromTemplate(input({ affectedClusterCount: 3 }));

    expect(brief.context.join(" ")).toContain("3 prompt clusters");
  });

  it("правило «нет своей страницы» приносит число рассмотренных источников", () => {
    const brief = buildBriefFromTemplate(
      input({
        actionType: "create_page",
        sourceDomain: null,
        evidence: { competitorsPresent: [], influentialCount: 9 },
      }),
    );

    expect(brief.context.join(" ")).toContain("9 sources");
    expect(brief.objective).toContain("client's domain");
  });

  it("у каждого типа работ бриф собирается и цель непуста", () => {
    for (const actionType of ACTION_TYPES) {
      const brief = buildBriefFromTemplate(input({ actionType }));
      expect(brief.objective.trim().length).toBeGreaterThan(0);
    }
  });

  it("TemplateBriefWriter отдаёт то же, что чистая функция", async () => {
    const written = await new TemplateBriefWriter().write(input());
    expect(written).toEqual(buildBriefFromTemplate(input()));
  });
});
