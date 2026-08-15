import {
  collapsePromptFacts,
  computeMovement,
  computeProminence,
  computePromptMatrix,
  isDistinguishable,
  MIN_SAMPLES_PER_CELL,
} from "@repo/core";
import {
  listActivePromptsForClient,
  listPromptPlatformFacts,
  type Client,
  type Database,
} from "@repo/db";

/**
 * Видимость клиента за окно: матрица, заметность и движение.
 *
 * Одна функция на экран и на публичный API. Второе определение той же
 * цифры рано или поздно разошлось бы с первым, и агентство получило бы в
 * своём дашборде не то, что видит у нас.
 */
export async function clientVisibility(
  db: Database,
  client: Client,
  windowDays = 28,
) {
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
