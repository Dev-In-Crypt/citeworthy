import type { PortfolioRow } from "@repo/db";

/**
 * Что у клиента ждёт человека.
 *
 * Раньше это был список готовых строк, и его хватало ровно на одну колонку
 * таблицы. Лента на главной и боковая колонка на экране клиента показывают то
 * же самое, но им нужен не текст, а сам факт: какого он рода, срочный ли и
 * какая кнопка его закрывает. Собирать один и тот же вывод в трёх местах
 * значит однажды получить три разных ответа на вопрос «сколько всего ждёт».
 *
 * Возможности идут первыми: агентство приходит сюда за вопросом «за что
 * взяться», а не «какой у клиента средний процент».
 */

/** Куда ведёт строка. Сегмент, а не готовый адрес: типизированные роуты Next
 *  проверяют литерал ссылки, и склейка из переменной перестаёт быть адресом. */
export type NeedsTarget = "opportunities" | "reports" | "actions" | "measure";

export type NeedsTone =
  /** Ждёт решения человека. */
  | "needs-you"
  /** Просрочено — висит дольше, чем должно. */
  | "overdue"
  /** Справочное: знать полезно, решать нечего. */
  | "info";

export interface NeedsRow {
  kind: "opportunity" | "report" | "action" | "run";
  tone: NeedsTone;
  text: string;
  /** Подпись кнопки называет, что произойдёт, а не «открыть». */
  cta: string;
  to: NeedsTarget;
}

export function needsFor(row: PortfolioRow): NeedsRow[] {
  const needs: NeedsRow[] = [];

  if (row.highPriorityOpportunities > 0) {
    needs.push({
      kind: "opportunity",
      tone: "needs-you",
      text:
        row.highPriorityOpportunities === 1
          ? "1 high-priority opportunity"
          : `${row.highPriorityOpportunities} high-priority opportunities`,
      cta: "Review",
      to: "opportunities",
    });
  }

  if (row.reportsAwaitingApproval > 0) {
    needs.push({
      kind: "report",
      tone: "needs-you",
      text:
        row.reportsAwaitingApproval === 1
          ? "Report to approve"
          : `${row.reportsAwaitingApproval} reports to approve`,
      cta: "Review",
      to: "reports",
    });
  }

  if (row.staleActions > 0) {
    needs.push({
      kind: "action",
      tone: "overdue",
      text: `${row.staleActions} actions stalled`,
      cta: "Assign",
      to: "actions",
    });
  }

  if (row.lastRunAt === null) {
    needs.push({
      kind: "run",
      tone: "info",
      text: "Awaiting first run",
      cta: "Schedule",
      to: "measure",
    });
  }

  return needs;
}
