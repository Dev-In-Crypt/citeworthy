import { computeVisibilitySnapshots } from "@repo/core";
import type { Platform, ResponseRecord } from "@repo/core";
import {
  deleteSnapshotsNotIn,
  listResponseFactsForClient,
  upsertVisibilitySnapshot,
} from "@repo/db";
import type { Database } from "@repo/db";
import { detectExperimentEvents } from "./experiment-events";

/**
 * Пересчитывает visibility_snapshots клиента (контракт C3).
 * Идемпотентен: повторный запуск переписывает те же ячейки, а не добавляет новые.
 */
export async function aggregateClient(db: Database, clientId: string): Promise<number> {
  const facts = await listResponseFactsForClient(db, clientId);

  // Плоские строки join'а схлопываются обратно в ответы: у ответа может быть
  // несколько упоминаний, и без группировки один ответ считался бы несколько раз.
  const byResponse = new Map<string, ResponseRecord>();

  for (const fact of facts) {
    let record = byResponse.get(fact.responseId);
    if (!record) {
      record = {
        responseId: fact.responseId,
        clusterId: fact.clusterId,
        platform: fact.platform as Platform,
        createdAt: fact.createdAt,
        clientMentioned: false,
        competitorsMentioned: [],
      };
      byResponse.set(fact.responseId, record);
    }

    if (fact.isClient) {
      record.clientMentioned = true;
    }
    if (fact.isCompetitor && fact.entityName) {
      record.competitorsMentioned.push(fact.entityName);
    }
  }

  const snapshots = computeVisibilitySnapshots([...byResponse.values()]);

  for (const snapshot of snapshots) {
    await upsertVisibilitySnapshot(db, {
      clientId,
      clusterId: snapshot.clusterId,
      platform: snapshot.platform,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      // numeric принимает строку: иначе теряется точность на дробных процентах.
      clientVisibilityPct: snapshot.clientVisibilityPct.toFixed(1),
      competitorVisibility: snapshot.competitorVisibility,
      sampleCount: snapshot.sampleCount,
      sufficient: snapshot.sufficient,
    });
  }

  // Ячейки, которых в пересчёте больше нет, удаляются: иначе срез по платформе,
  // которую перестали учитывать, продолжит утверждать, что её измеряли.
  await deleteSnapshotsNotIn(
    db,
    clientId,
    snapshots.map((snapshot) => ({
      clusterId: snapshot.clusterId,
      platform: snapshot.platform,
      periodStart: snapshot.periodStart,
    })),
  );

  // Свежие срезы посчитаны — можно дописать события на таймлайны экспериментов.
  await detectExperimentEvents(db, clientId);

  return snapshots.length;
}
