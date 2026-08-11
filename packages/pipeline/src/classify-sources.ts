import { classifyDomain } from "@repo/core";
import {
  ensureSource,
  getClientById,
  getRunById,
  linkCitationToSource,
  listCitationsByResponse,
  listResponsesByRun,
} from "@repo/db";
import type { Database } from "@repo/db";

export interface ClassifyOutcome {
  domains: number;
  classifiedByRule: number;
  awaitingModel: number;
}

/**
 * Заводит источники по процитированным доменам прогона и классифицирует
 * их правилами. Домены, которые правило не узнало, остаются без типа
 * и уходят классификатору-модели (T31).
 */
export async function classifyRunSources(db: Database, runId: string): Promise<ClassifyOutcome> {
  const responses = await listResponsesByRun(db, runId);
  if (responses.length === 0) {
    return { domains: 0, classifiedByRule: 0, awaitingModel: 0 };
  }

  const firstResponse = responses[0]!;
  const client = await getClientForRun(db, firstResponse.runId);

  const seen = new Map<string, string>();
  let classifiedByRule = 0;

  for (const response of responses) {
    for (const citation of await listCitationsByResponse(db, response.id)) {
      if (citation.domain === "") continue;

      let sourceId = seen.get(citation.domain);
      if (!sourceId) {
        const ruleType = classifyDomain(citation.domain, {
          ...(client?.domain ? { clientDomain: client.domain } : {}),
        });

        const source = await ensureSource(
          db,
          citation.domain,
          ruleType ? { sourceType: ruleType, classifiedBy: "rule" } : undefined,
        );

        if (ruleType) classifiedByRule++;
        sourceId = source.id;
        seen.set(citation.domain, sourceId);
      }

      await linkCitationToSource(db, citation.id, sourceId);
    }
  }

  return {
    domains: seen.size,
    classifiedByRule,
    awaitingModel: seen.size - classifiedByRule,
  };
}

async function getClientForRun(db: Database, runId: string) {
  const run = await getRunById(db, runId);
  return run ? getClientById(db, run.clientId) : undefined;
}
