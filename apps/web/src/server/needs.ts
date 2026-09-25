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

/**
 * @param allowedAssistants кого тариф разрешает измерять прямо сейчас.
 *   Передаётся снаружи, а не берётся здесь: права считаются по подписке, а
 *   этот файл о них ничего не знает и знать не должен.
 */
export function needsFor(row: PortfolioRow, allowedAssistants: readonly string[] = []): NeedsRow[] {
  const needs: NeedsRow[] = [];

  /**
   * В расписании остались те, кого продукт уже не спрашивает.
   *
   * Так бывает после перехода на младший тариф и после решения перестать
   * измерять платформу: строку расписания никто не переписывает. Экран
   * измерения об этом говорит, но агентство доходит туда по одному клиенту
   * и может месяц не знать, что часть книги измеряется уже, чем настроено.
   *
   * Пустой список разрешённых означает «ещё не знаем» — тогда молчим:
   * поднять тревогу на незагруженных правах хуже, чем промолчать.
   */
  const dropped =
    allowedAssistants.length > 0
      ? row.scheduledAssistants.filter((id) => !allowedAssistants.includes(id))
      : [];

  if (dropped.length > 0) {
    needs.push({
      kind: "run",
      tone: "needs-you",
      text:
        dropped.length === 1
          ? "1 assistant in the schedule is no longer measured"
          : `${dropped.length} assistants in the schedule are no longer measured`,
      cta: "Fix schedule",
      to: "measure",
    });
  }

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
