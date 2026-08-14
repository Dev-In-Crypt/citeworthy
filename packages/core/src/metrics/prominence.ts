import { meetsSampleFloor } from "./confidence";

/**
 * Насколько заметно назван клиент, а не только назван ли вообще.
 *
 * Инструменты этой категории меряют факт упоминания: бренд назван — единица,
 * не назван — ноль. Покупатель так не читает. Ответ, который начинается с
 * конкурента и упоминает клиента четвёртым в списке «а ещё есть», — это не
 * то же самое, что ответ, где клиент назван первым, хотя обе доли равны 100%.
 *
 * Данные для этого уже лежат в базе: парсер сохраняет порядок появления
 * брендов в ответе (контракт C2). Ничего дополнительно измерять не нужно —
 * это тот же ответ, прочитанный внимательнее.
 */

export interface AnswerProminenceRecord {
  responseId: string;
  /** Место клиента среди названных брендов, 1-based. null — не назван. */
  clientRank: number | null;
  /** Места конкурентов в том же ответе. */
  competitorRanks: number[];
}

export interface Prominence {
  /** Ответов рассмотрено. */
  answers: number;
  /** В скольких клиент назван. */
  named: number;
  /** В скольких он назван первым брендом ответа. */
  namedFirst: number;
  /** В скольких назван раньше любого названного конкурента. */
  aheadOfCompetitors: number;
  /** В скольких назван после хотя бы одного конкурента. */
  behindCompetitors: number;
  /** Среднее место среди названных брендов; null — ни разу не назван. */
  averageRank: number | null;
  /** Хватает ли ответов, чтобы показывать доли (контракт C3). */
  sufficient: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeProminence(records: readonly AnswerProminenceRecord[]): Prominence {
  let named = 0;
  let namedFirst = 0;
  let ahead = 0;
  let behind = 0;
  let rankSum = 0;

  for (const record of records) {
    if (record.clientRank === null) {
      continue;
    }

    named += 1;
    rankSum += record.clientRank;

    if (record.clientRank === 1) {
      namedFirst += 1;
    }

    const bestCompetitor = record.competitorRanks.length
      ? Math.min(...record.competitorRanks)
      : null;

    if (bestCompetitor === null || record.clientRank < bestCompetitor) {
      // Конкурентов в ответе нет или клиент назван раньше всех них.
      ahead += 1;
    } else {
      behind += 1;
    }
  }

  return {
    answers: records.length,
    named,
    namedFirst,
    aheadOfCompetitors: ahead,
    behindCompetitors: behind,
    averageRank: named === 0 ? null : round1(rankSum / named),
    sufficient: meetsSampleFloor(records.length),
  };
}

/** Доля в процентах от числа ответов, где клиент назван. Null, если считать не от чего. */
export function shareOfNamed(count: number, named: number): number | null {
  return named === 0 ? null : round1((count / named) * 100);
}
