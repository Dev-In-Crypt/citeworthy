import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Одно понятие — одно имя.
 *
 * Экран `/measure` назывался «Analytics» во вкладке, «Visibility» в
 * подвкладке и «Measure» в заголовке; `/diagnose` — «Sources» и «Diagnose».
 * Человек читает три имени как три разных места. Тест сверяет вкладку,
 * подвкладку и заголовок экрана дословно — и падает, как только они
 * разъедутся снова.
 *
 * Проверяется по исходникам, а не по отрисованной странице: в этом пакете
 * нет DOM-окружения, а вопрос здесь чисто текстовый.
 */

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/** Подписи ссылок на сегмент — их в файле две: вкладка и подвкладка. */
function labels(source: string, segment: string): string[] {
  const pattern = new RegExp(`segment:\\s*"${segment}",\\s*label:\\s*"([^"]+)"`, "g");
  return [...source.matchAll(pattern)].map((match) => match[1] ?? "");
}

/** Заголовок самого экрана. Ветка «клиент не найден» — не он. */
function heading(source: string): string[] {
  return [...source.matchAll(/<PageHeader\s+title="([^"]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((title) => title !== "Client not found");
}

const tabs = read("../client-tabs.tsx");
const diagnosePage = read("./page.tsx");
const measurePage = read("../measure/page.tsx");

describe("имена экранов клиента", () => {
  it("вкладка, подвкладка и заголовок Measure — одно слово", () => {
    expect(labels(tabs, "measure")).toEqual(["Measure", "Measure"]);
    expect(heading(measurePage)).toEqual(["Measure"]);
  });

  it("вкладка и заголовок Diagnose — одно слово", () => {
    expect(labels(tabs, "diagnose")).toEqual(["Diagnose"]);
    expect(heading(diagnosePage)).toEqual(["Diagnose"]);
  });

  it("прежние синонимы тех же экранов в навигации не остались", () => {
    for (const synonym of ["Analytics", "Visibility", "Sources"]) {
      expect(tabs.includes(`label: "${synonym}"`)).toBe(false);
    }
  });
});
