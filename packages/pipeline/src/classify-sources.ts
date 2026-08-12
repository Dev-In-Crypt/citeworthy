import { CachingSourceClassifier, classifyDomain, HeuristicSourceClassifier } from "@repo/core";
import type { SourceClassifier } from "@repo/core";
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
  classifiedByModel: number;
  unclassified: number;
}

/**
 * Заводит источники по процитированным доменам прогона и классифицирует их.
 *
 * Порядок: словарь → классификатор. Домен, уже лежащий в `sources` с типом,
 * не переклассифицируется вовсе — таблица и есть постоянный кэш, а объект
 * CachingSourceClassifier снимает повторы внутри одного прогона.
 */
export async function classifyRunSources(
  db: Database,
  runId: string,
  classifier: SourceClassifier = new HeuristicSourceClassifier(),
): Promise<ClassifyOutcome> {
  const responses = await listResponsesByRun(db, runId);
  if (responses.length === 0) {
    return { domains: 0, classifiedByRule: 0, classifiedByModel: 0, unclassified: 0 };
  }

  const run = await getRunById(db, runId);
  const client = run ? await getClientById(db, run.clientId) : undefined;
  const cached = new CachingSourceClassifier(classifier);

  const seen = new Map<string, string>();
  let classifiedByRule = 0;
  let classifiedByModel = 0;
  let unclassified = 0;

  for (const response of responses) {
    for (const citation of await listCitationsByResponse(db, response.id)) {
      if (citation.domain === "") continue;

      let sourceId = seen.get(citation.domain);
      if (!sourceId) {
        const source = await resolveSource(db, citation, client?.domain, cached, {
          onRule: () => classifiedByRule++,
          onModel: () => classifiedByModel++,
          onUnknown: () => unclassified++,
        });
        sourceId = source;
        seen.set(citation.domain, sourceId);
      }

      await linkCitationToSource(db, citation.id, sourceId);
    }
  }

  return { domains: seen.size, classifiedByRule, classifiedByModel, unclassified };
}

async function resolveSource(
  db: Database,
  citation: { domain: string; title: string | null },
  clientDomain: string | undefined,
  classifier: SourceClassifier,
  counters: { onRule: () => void; onModel: () => void; onUnknown: () => void },
): Promise<string> {
  // Уже классифицированный домен не тревожим: sources — постоянный кэш,
  // и повторный вызов модели за тот же домен это чистые деньги на ветер.
  const existing = await ensureSource(db, citation.domain);
  if (existing.sourceType !== null) {
    return existing.id;
  }

  const byRule = classifyDomain(citation.domain, {
    ...(clientDomain ? { clientDomain } : {}),
  });

  // `owned` — свойство пары (клиент, домен), а не домена: таблица `sources`
  // общая на всех, и запись «owned» из одного агентства объявила бы этот
  // домен собственным для любого другого клиента, который его процитировал.
  // Признак владения проставляется при чтении, по домену самого клиента.
  if (byRule === "owned") {
    counters.onRule();
    return existing.id;
  }

  if (byRule) {
    counters.onRule();
    const updated = await ensureSource(db, citation.domain, {
      sourceType: byRule,
      classifiedBy: "rule",
    });
    return updated.id;
  }

  const byModel = await classifier.classify(citation.domain, {
    ...(citation.title ? { title: citation.title } : {}),
  });

  if (byModel) {
    counters.onModel();
    const updated = await ensureSource(db, citation.domain, {
      sourceType: byModel,
      classifiedBy: "model",
    });
    return updated.id;
  }

  // Остаётся без типа — это видно в данных и чинится расширением словаря.
  counters.onUnknown();
  return existing.id;
}
