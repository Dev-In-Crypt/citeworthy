/**
 * Недельная сводка по портфелю: что произошло и кому нужно внимание.
 *
 * Отдельная чистая функция, а не разметка внутри экрана. Сейчас её читает
 * дашборд, но тот же результат должен уметь уйти письмом — а для этого он
 * обязан существовать как данные, а не как JSX. Никаких новых интеграций
 * ради этого не заводится: почтовый отправитель в продукте уже есть.
 *
 * Ни одна строка здесь не считает измерений заново — всё приходит из
 * портфельного запроса, который и так открывается на каждом заходе.
 */

import type { NeedsRow } from "./needs";

/** Строка портфеля в том виде, в каком её собирает `clients.portfolio`. */
export interface BriefRow {
  clientId: string;
  name: string;
  needs: NeedsRow[];
  newOpportunities: number;
  highPriorityOpportunities: number;
  reportsAwaitingApproval: number;
  staleActions: number;
  topOpportunityScore: number | null;
}

export interface BriefHighlight {
  clientId: string;
  name: string;
  /** Одна строка, ради которой человек откроет клиента. */
  headline: string;
  /** Все строки целиком: лента на главной показывает каждую со своей кнопкой. */
  rows: NeedsRow[];
  /** Сколько ещё пунктов ждёт у того же клиента. */
  alsoWaiting: number;
  topOpportunityScore: number | null;
}

export interface WeeklyBrief {
  clients: number;
  clientsNeedingAttention: number;
  newOpportunities: number;
  highPriorityOpportunities: number;
  reportsAwaitingApproval: number;
  staleActions: number;
  highlights: BriefHighlight[];
}

export const BRIEF_HIGHLIGHT_LIMIT = 6;

export function buildWeeklyBrief(rows: readonly BriefRow[]): WeeklyBrief {
  const waiting = rows.filter((row) => row.needs.length > 0);

  return {
    clients: rows.length,
    clientsNeedingAttention: waiting.length,
    newOpportunities: rows.reduce((total, row) => total + row.newOpportunities, 0),
    highPriorityOpportunities: rows.reduce(
      (total, row) => total + row.highPriorityOpportunities,
      0,
    ),
    reportsAwaitingApproval: rows.reduce((total, row) => total + row.reportsAwaitingApproval, 0),
    staleActions: rows.reduce((total, row) => total + row.staleActions, 0),
    // Порядок тот же, что на экране: сначала самая весомая находка.
    highlights: [...waiting]
      .sort((a, b) => (b.topOpportunityScore ?? -1) - (a.topOpportunityScore ?? -1))
      .slice(0, BRIEF_HIGHLIGHT_LIMIT)
      .map((row) => ({
        clientId: row.clientId,
        name: row.name,
        headline: row.needs[0]?.text ?? "",
        rows: row.needs,
        alsoWaiting: Math.max(0, row.needs.length - 1),
        topOpportunityScore: row.topOpportunityScore,
      })),
  };
}
