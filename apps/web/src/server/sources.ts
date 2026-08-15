import { diagnose } from "@repo/core";
import type { CitationFact, SourceType } from "@repo/core";
import { listCitationFacts, type Database } from "@repo/db";

/**
 * Диагноз по источникам. Одна функция на экран и на публичный API: второе
 * определение тех же долей однажды разошлось бы с первым.
 */

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

/** Оговорка, которую нельзя терять ни на экране, ни в выгрузке. */
export const PRESENCE_CAVEAT =
  "Presence is inferred from answers where the source was cited, not from checking the page itself.";

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
