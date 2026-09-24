import {
  assistantBasisNote,
  collapsePromptFacts,
  compareAssistantSets,
  computeMovement,
  computeProminence,
  computePromptMatrix,
  diagnose,
  DIAGNOSIS_COPY,
  isDistinguishable,
  measuredAssistants,
  MIN_SAMPLES_PER_CELL,
  restrictToAssistants,
} from "@repo/core";
import type { CitationFact, SourceType } from "@repo/core";
import {
  databaseNow,
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
  /**
   * Верхняя граница окна — по часам базы, а не приложения.
   *
   * Время на ответе ставит Postgres. Брать границу у Node значит сравнивать
   * двое часов: там, где база спешит, только что записанный ответ выпадает
   * за верхнюю границу и не попадает в расчёт, пока разница не истечёт.
   */
  const to = await databaseNow(db);
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

  const currentInput = { records, prompts: promptRows, from, to };
  const previousInput = {
    records: collapsePromptFacts(previousFacts),
    prompts: promptRows,
    from: previousFrom,
    to: from,
  };

  const matrix = computePromptMatrix(currentInput);
  const previous = computePromptMatrix(previousInput);

  /**
   * Сравнивается только общая часть двух окон.
   *
   * Доля — это доля от тех ответов, что есть. Включили ассистента или
   * выключили — знаменатель другой, и число едет само, без единого
   * изменения у клиента. Причём едет заметно, и проверка «отличимо ли от
   * шума» такой сдвиг подтверждает: интервалы не пересекаются. Защита
   * срабатывает наоборот, поэтому её нельзя оставлять на неодинаковых
   * наборах.
   *
   * Показываем при этом полное окно: агентство должно видеть всё, что
   * измерено, включая только что включённого ассистента. А сравнение идёт
   * по общему набору — и подпись говорит, по какому именно.
   */
  const basis = compareAssistantSets(measuredAssistants(matrix), measuredAssistants(previous));
  const comparable =
    basis.delta === "show"
      ? { current: matrix, previous }
      : {
          current: restrictToAssistants(currentInput, basis.shared),
          previous: restrictToAssistants(previousInput, basis.shared),
        };

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
    movement: computeMovement(comparable.current, comparable.previous),
    // Общее движение — та же логика: сравнивать можно только два окна,
    // каждое из которых само по себе набрало порог.
    totalsDeltaPp:
      comparable.current.totals.ratePct !== null && comparable.previous.totals.ratePct !== null
        ? Math.round(
            (comparable.current.totals.ratePct - comparable.previous.totals.ratePct) * 10,
          ) / 10
        : null,
    /**
     * Различает ли выборка это изменение вообще.
     *
     * Только по сопоставимой паре: на разных наборах непересечение
     * интервалов не говорит о клиенте ничего.
     */
    totalsDistinguishable:
      basis.allowDistinguishability &&
      isDistinguishable(comparable.current.totals.interval, comparable.previous.totals.interval),
    /** Состав измеренных ассистентов и приписка о нём — null, если не менялся. */
    assistantBasis: basis,
    assistantBasisNote: assistantBasisNote(basis),
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
