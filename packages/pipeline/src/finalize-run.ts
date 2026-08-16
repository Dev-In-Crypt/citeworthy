import { countResponsesByRun, finishRun, getAgencyIdForRun, logActivity } from "@repo/db";
import type { Database } from "@repo/db";
import { parseRun } from "./parse-job";
import { classifyRunSources } from "./classify-sources";
import { aggregateClient } from "./aggregate-job";
import { detectExperimentEvents } from "./experiment-events";
import { refreshOpportunities } from "./refresh-opportunities";

/**
 * Хвост прогона: когда все ответы доехали.
 *
 * Отличается от `completeRun` тем, что сам ничего не спрашивает у платформ:
 * ответы уже получены задачами очередей. Шаги те же и в том же порядке —
 * пропущенная классификация источников не ломает ни один экран заметно,
 * диагностика просто показывает домены без вида площадки, и заметить это
 * можно спустя недели.
 */
export interface FinalizeRunOutcome {
  status: "done" | "failed";
  responses: number;
  expected: number;
  parsedResponses: number;
  classifiedDomains: number;
  snapshots: number;
  opportunities: number;
}

export async function finalizeRun(
  db: Database,
  input: {
    runId: string;
    clientId: string;
    expected: number;
    /** Куда сообщить, если пересчёт возможностей упал: прогон при этом цел. */
    onError?: (error: unknown) => void;
  },
): Promise<FinalizeRunOutcome> {
  const written = await countResponsesByRun(db, input.runId);

  /**
   * Неполный прогон помечается failed, а не done: доля, посчитанная по
   * обрезанной выборке, выглядит как измерение и им не является.
   */
  const status = written >= input.expected ? "done" : "failed";
  await finishRun(db, input.runId, status);

  const parsed = await parseRun(db, input.runId);
  const classified = await classifyRunSources(db, input.runId);
  const snapshots = await aggregateClient(db, input.clientId);
  await detectExperimentEvents(db, input.clientId);
  const opportunities = await refreshOpportunities(db, input.clientId, input.onError);

  const agencyId = await getAgencyIdForRun(db, input.runId);
  if (agencyId) {
    await logActivity(db, {
      agencyId,
      clientId: input.clientId,
      // Прогон по расписанию делает система, а не человек.
      actorUserId: null,
      eventType: "run_finished",
      payload: {
        runId: input.runId,
        status,
        answers: written,
        expected: input.expected,
        failed: Math.max(0, input.expected - written),
      },
    });
  }

  return {
    status,
    responses: written,
    expected: input.expected,
    parsedResponses: parsed.length,
    classifiedDomains: classified.domains,
    snapshots,
    opportunities,
  };
}
