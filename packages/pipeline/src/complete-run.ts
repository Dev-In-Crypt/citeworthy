import type { Database } from "@repo/db";
import type { AdaptersMode } from "@repo/core";
import { orchestrateRun } from "./run-orchestration";
import { parseRun } from "./parse-job";
import { classifyRunSources } from "./classify-sources";
import { aggregateClient } from "./aggregate-job";

/**
 * Полная цепочка от прогона до готовой диагностики.
 *
 * Шаги собраны в одном месте намеренно: пропущенная классификация источников
 * не ломает ни один экран заметно — диагностика просто показывает домены без
 * типов, будто у площадок нет вида. Такое расхождение видно не сразу, поэтому
 * порядок шагов должен быть один на все точки входа, а не повторяться в каждой.
 */
export interface CompleteRunOutcome {
  status: "done" | "failed";
  responses: number;
  failed: number;
  parsedResponses: number;
  classifiedDomains: number;
  snapshots: number;
}

export async function completeRun(
  db: Database,
  runId: string,
  clientId: string,
  mode: AdaptersMode = "mock",
): Promise<CompleteRunOutcome> {
  const run = await orchestrateRun(db, runId, mode);
  const parsed = await parseRun(db, runId);
  const classified = await classifyRunSources(db, runId);
  const snapshots = await aggregateClient(db, clientId);

  return {
    status: run.status,
    responses: run.written,
    failed: run.failed,
    parsedResponses: parsed.length,
    classifiedDomains: classified.domains,
    snapshots,
  };
}
