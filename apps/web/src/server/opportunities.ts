import { priorityFor, type OpportunityPriority } from "@repo/core";
import { listOpportunities, type Database, type Opportunity } from "@repo/db";

/**
 * Чтение возможностей: одно определение на экран и на публичный API.
 *
 * Приоритет не хранится в базе — он выводится из оценки здесь, в одном месте.
 * Вторая его копия рано или поздно разошлась бы с формулой, и список на экране
 * начал бы противоречить выгрузке по API.
 */

export interface OpportunityView {
  id: string;
  clientId: string;
  kind: Opportunity["kind"];
  status: Opportunity["status"];
  title: string;
  reason: string;
  score: number;
  scoreVersion: number;
  priority: OpportunityPriority;
  evidenceLevel: "low" | "medium" | "high";
  affectedPromptCount: number;
  competitorNames: string[];
  sourceDomain: string | null;
  sampleCount: number;
  windowStart: Date;
  windowEnd: Date;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  resolvedAt: Date | null;
  dismissedReason: string | null;
}

export function toOpportunityView(row: Opportunity): OpportunityView {
  return {
    id: row.id,
    clientId: row.clientId,
    kind: row.kind,
    status: row.status,
    title: row.title,
    reason: row.reason,
    score: row.score,
    scoreVersion: row.scoreVersion,
    priority: priorityFor(row.score),
    evidenceLevel: row.evidenceLevel,
    affectedPromptCount: row.affectedPromptIds.length,
    competitorNames: row.competitorNames,
    sourceDomain: row.sourceDomain,
    sampleCount: row.sampleCount,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    firstDetectedAt: row.firstDetectedAt,
    lastDetectedAt: row.lastDetectedAt,
    resolvedAt: row.resolvedAt,
    dismissedReason: row.dismissedReason,
  };
}

export async function clientOpportunities(
  db: Database,
  clientId: string,
  options: { includeResolved?: boolean } = {},
): Promise<OpportunityView[]> {
  const rows = await listOpportunities(db, clientId, options);
  return rows.map(toOpportunityView);
}
