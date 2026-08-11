import type { Platform } from "../adapters/types";

/**
 * Контракт C3.
 *
 * visibility_pct = доля ответов за период, где упомянут клиент.
 * Считается только по агрегатам: один ответ модели — это не измерение,
 * а бросок монетки (инвариант 6 в CLAUDE.md).
 */

/** Минимум сэмплов на ячейку, ниже которого цифру нельзя показывать как измерение. */
export const MIN_SAMPLES_PER_CELL = 3;

export interface ResponseRecord {
  responseId: string;
  clusterId: string;
  platform: Platform;
  createdAt: Date;
  clientMentioned: boolean;
  /** Канонические имена конкурентов, упомянутых в этом ответе. */
  competitorsMentioned: string[];
}

export interface VisibilitySnapshot {
  /** null означает свёртку по всем кластерам. */
  clusterId: string | null;
  /** null означает свёртку по всем платформам. */
  platform: Platform | null;
  periodStart: Date;
  periodEnd: Date;
  clientVisibilityPct: number;
  competitorVisibility: Record<string, number>;
  sampleCount: number;
  /** false — цифру нельзя показывать как измерение, сэмплов слишком мало. */
  sufficient: boolean;
}

/** Понедельник 00:00 UTC той недели, в которую попадает дата. */
export function startOfIsoWeek(date: Date): Date {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  // getUTCDay(): 0 = воскресенье, поэтому воскресенье относим к предыдущей неделе.
  const dayOffset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - dayOffset);
  return utc;
}

export function endOfIsoWeek(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Bucket {
  clusterId: string | null;
  platform: Platform | null;
  periodStart: Date;
  total: number;
  withClient: number;
  competitorHits: Map<string, number>;
}

function bucketKey(clusterId: string | null, platform: string | null, weekStart: Date): string {
  return `${clusterId ?? "*"}|${platform ?? "*"}|${weekStart.toISOString()}`;
}

/**
 * Считает срезы: кластер × платформа, кластер × все платформы,
 * все кластеры × платформа, и общий итог. Разрезы с null — это свёртки,
 * а не отдельные измерения: они считаются по тем же ответам.
 */
export function computeVisibilitySnapshots(records: ResponseRecord[]): VisibilitySnapshot[] {
  const buckets = new Map<string, Bucket>();

  for (const record of records) {
    const weekStart = startOfIsoWeek(record.createdAt);

    const cells: [string | null, Platform | null][] = [
      [record.clusterId, record.platform],
      [record.clusterId, null],
      [null, record.platform],
      [null, null],
    ];

    for (const [clusterId, platform] of cells) {
      const key = bucketKey(clusterId, platform, weekStart);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          clusterId,
          platform,
          periodStart: weekStart,
          total: 0,
          withClient: 0,
          competitorHits: new Map(),
        };
        buckets.set(key, bucket);
      }

      bucket.total += 1;
      if (record.clientMentioned) {
        bucket.withClient += 1;
      }
      // Один ответ добавляет конкуренту не более одного попадания,
      // иначе повторное упоминание в тексте завысило бы его долю.
      for (const competitor of new Set(record.competitorsMentioned)) {
        bucket.competitorHits.set(competitor, (bucket.competitorHits.get(competitor) ?? 0) + 1);
      }
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const competitorVisibility: Record<string, number> = {};
      for (const [name, hits] of bucket.competitorHits) {
        competitorVisibility[name] = round1((hits / bucket.total) * 100);
      }

      return {
        clusterId: bucket.clusterId,
        platform: bucket.platform,
        periodStart: bucket.periodStart,
        periodEnd: endOfIsoWeek(bucket.periodStart),
        clientVisibilityPct: round1((bucket.withClient / bucket.total) * 100),
        competitorVisibility,
        sampleCount: bucket.total,
        sufficient: bucket.total >= MIN_SAMPLES_PER_CELL,
      };
    })
    .sort(
      (a, b) =>
        a.periodStart.getTime() - b.periodStart.getTime() ||
        (a.clusterId ?? "").localeCompare(b.clusterId ?? "") ||
        (a.platform ?? "").localeCompare(b.platform ?? ""),
    );
}

/** Разрыв с конкурентом в процентных пунктах. Отрицательное значение = клиент отстаёт. */
export function competitorGapPp(snapshot: VisibilitySnapshot): number {
  const best = Math.max(0, ...Object.values(snapshot.competitorVisibility));
  return round1(snapshot.clientVisibilityPct - best);
}
