import {
  collapsePromptFacts,
  computeMovement,
  computeProminence,
  computePromptMatrix,
  diagnose,
  DIAGNOSIS_COPY,
  isDistinguishable,
  MIN_SAMPLES_PER_CELL,
} from "@repo/core";
import type { CitationFact, SourceType } from "@repo/core";
import {
  listActivePromptsForClient,
  listCitationFacts,
  listPromptPlatformFacts,
  type Client,
  type Database,
} from "@repo/db";

/**
 * Модели чтения: видимость и диагноз по источникам.
 *
 * Раньше обе функции жили в `apps/web/src/server`, и это работало, пока их
 * читали только экраны и публичный API. Генератору возможностей нужны те же
 * цифры, а воркер импортировать из приложения не может — переписать их у себя
 * значило бы завести второе определение той же видимости, которое однажды
 * разойдётся с первым. Поэтому они спустились сюда, а `apps/web` их
 * переэкспортирует: одно определение на экран, на API и на пересчёт.
 */

export async function clientVisibility(db: Database, client: Client, windowDays = 28) {
  const to = new Date();
  const windowMs = windowDays * 86_400_000;
  const from = new Date(to.getTime() - windowMs);
  // Предыдущее окно той же длины — только для ответа «что изменилось».
  const previousFrom = new Date(from.getTime() - windowMs);

  const [prompts, facts, previousFacts] = await Promise.all([
    listActivePromptsForClient(db, client.id),
    listPromptPlatformFacts(db, client.id, from, to),
    listPromptPlatformFacts(db, client.id, previousFrom, from),
  ]);

  // Порядок строк фиксируется здесь: запрос его не гарантирует, а матрица,
  // переставляющая вопросы между заходами, нечитаема.
  const ordered = [...prompts].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });

  const records = collapsePromptFacts(facts);
  const promptRows = ordered.map((prompt) => ({
    id: prompt.id,
    text: prompt.text,
    clusterId: prompt.clusterId,
  }));

  const matrix = computePromptMatrix({ records, prompts: promptRows, from, to });
  const previous = computePromptMatrix({
    records: collapsePromptFacts(previousFacts),
    prompts: promptRows,
    from: previousFrom,
    to: from,
  });

  /**
   * Заметность считается по тем же ответам, что и матрица: «назван» и
   * «назван первым» — разные вещи, а мерить их по разным выборкам значит
   * получить два числа, которые нельзя сопоставить.
   */
  const prominence = computeProminence(
    records.map((record) => ({
      responseId: record.responseId,
      clientRank: record.clientRank ?? null,
      competitorRanks: record.competitorRanks ?? [],
    })),
  );

  return {
    ...matrix,
    prominence,
    movement: computeMovement(matrix, previous),
    // Общее движение — та же логика: сравнивать можно только два окна,
    // каждое из которых само по себе набрало порог.
    totalsDeltaPp:
      matrix.totals.ratePct !== null && previous.totals.ratePct !== null
        ? Math.round((matrix.totals.ratePct - previous.totals.ratePct) * 10) / 10
        : null,
    /** Различает ли выборка это изменение вообще. */
    totalsDistinguishable: isDistinguishable(matrix.totals.interval, previous.totals.interval),
    client: { name: client.name, domain: client.domain },
    competitorNames: client.competitorNames,
    minSamples: MIN_SAMPLES_PER_CELL,
  };
}

/** Схлопывает плоские строки join'а в один факт на пару (ответ, домен). */
export function toCitationFacts(
  rows: {
    responseId: string;
    domain: string;
    sourceType: string | null;
    entityName: string | null;
    isClient: boolean | null;
    isCompetitor: boolean | null;
  }[],
): CitationFact[] {
  const byKey = new Map<string, CitationFact>();

  for (const row of rows) {
    const key = `${row.responseId}|${row.domain}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        domain: row.domain,
        sourceType: (row.sourceType as SourceType | null) ?? null,
        clientMentioned: false,
        competitorsMentioned: [],
      };
      byKey.set(key, entry);
    }

    if (row.isClient) entry.clientMentioned = true;
    if (row.isCompetitor && row.entityName) entry.competitorsMentioned.push(row.entityName);
  }

  return [...byKey.values()];
}

/**
 * Оговорка, которую нельзя терять ни на экране, ни в выгрузке.
 * Живёт в copy-константах: инвариант 2 требует, чтобы весь текст, который
 * видит покупатель, лежал в одном проверяемом месте.
 */
export const PRESENCE_CAVEAT = DIAGNOSIS_COPY.presenceCaveat;

export async function clientSources(
  db: Database,
  clientId: string,
  clusterId: string | null = null,
  limit = 25,
) {
  const facts = toCitationFacts(await listCitationFacts(db, clientId, clusterId));

  return {
    ...diagnose(facts, limit),
    totalCitations: facts.length,
    presenceCaveat: PRESENCE_CAVEAT,
  };
}
