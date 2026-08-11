import { DIAGNOSIS_COPY } from "../copy";
import type { SourceType } from "../sources/domains";

/**
 * Диагностика: почему клиент проигрывает в конкретном кластере.
 *
 * Всё здесь — чистые функции над уже собранными фактами. Никаких обращений
 * к модели: вывод должен воспроизводиться из данных, иначе агентство не сможет
 * его перепроверить перед тем, как показать клиенту.
 */

/** Один факт цитирования: источник, процитированный в ответе. */
export interface CitationFact {
  domain: string;
  sourceType: SourceType | null;
  /** Упомянут ли клиент в том же ответе, где процитирован источник. */
  clientMentioned: boolean;
  /** Конкуренты, упомянутые в том же ответе. */
  competitorsMentioned: string[];
}

export interface SourceMixEntry {
  sourceType: SourceType | "unclassified";
  citations: number;
  sharePct: number;
}

export interface InfluentialSource {
  domain: string;
  sourceType: SourceType | null;
  /** Сколько раз источник процитирован в измеренном периоде. */
  citations: number;
  /** Доля цитирований кластера, приходящаяся на этот источник. */
  sharePct: number;
  /** Упоминается ли клиент в ответах, где цитируется этот источник. */
  clientPresent: boolean;
  competitorsPresent: string[];
}

export interface SourceGap {
  /** Влиятельные источники, где конкуренты есть, а клиента нет. */
  missingFrom: InfluentialSource[];
  clientPresentIn: number;
  competitorPresentIn: number;
  totalInfluential: number;
}

export interface Diagnosis {
  mix: SourceMixEntry[];
  influential: InfluentialSource[];
  gap: SourceGap;
  /** Готовая формулировка вывода — только из copy-констант (инвариант 2). */
  statement: string;
  evidenceNote: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Распределение цитирований по типам источников. */
export function computeSourceMix(facts: CitationFact[]): SourceMixEntry[] {
  if (facts.length === 0) return [];

  const counts = new Map<SourceType | "unclassified", number>();
  for (const fact of facts) {
    const key = fact.sourceType ?? "unclassified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([sourceType, citations]) => ({
      sourceType,
      citations,
      sharePct: round1((citations / facts.length) * 100),
    }))
    .sort((a, b) => b.citations - a.citations);
}

/**
 * Влиятельные источники — те, которые модели цитируют чаще прочих.
 * Присутствие считается по ответам: если в ответе с этим источником
 * упомянут клиент, считаем его присутствующим. Это приближение MVP,
 * а не проверка самой страницы — и так и подписано в интерфейсе.
 */
export function rankInfluentialSources(facts: CitationFact[], limit = 25): InfluentialSource[] {
  const byDomain = new Map<
    string,
    {
      sourceType: SourceType | null;
      citations: number;
      clientHits: number;
      competitors: Set<string>;
    }
  >();

  for (const fact of facts) {
    let entry = byDomain.get(fact.domain);
    if (!entry) {
      entry = {
        sourceType: fact.sourceType,
        citations: 0,
        clientHits: 0,
        competitors: new Set(),
      };
      byDomain.set(fact.domain, entry);
    }

    entry.citations++;
    if (fact.clientMentioned) entry.clientHits++;
    for (const competitor of fact.competitorsMentioned) {
      entry.competitors.add(competitor);
    }
  }

  return [...byDomain.entries()]
    .map(([domain, entry]) => ({
      domain,
      sourceType: entry.sourceType,
      citations: entry.citations,
      sharePct: round1((entry.citations / facts.length) * 100),
      clientPresent: entry.clientHits > 0,
      competitorsPresent: [...entry.competitors].sort(),
    }))
    .sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

export function computeSourceGap(influential: InfluentialSource[]): SourceGap {
  const missingFrom = influential.filter(
    (source) => !source.clientPresent && source.competitorsPresent.length > 0,
  );

  return {
    missingFrom,
    clientPresentIn: influential.filter((s) => s.clientPresent).length,
    competitorPresentIn: influential.filter((s) => s.competitorsPresent.length > 0).length,
    totalInfluential: influential.length,
  };
}

/** Порог, ниже которого вывод не делается: на трёх источниках он был бы выдумкой. */
export const MIN_SOURCES_FOR_STATEMENT = 5;

/**
 * Формулировка вывода. Выбирает одну из заранее утверждённых строк —
 * свободный текст здесь запрещён инвариантом 2.
 */
export function buildStatement(mix: SourceMixEntry[], gap: SourceGap): string {
  if (gap.totalInfluential < MIN_SOURCES_FOR_STATEMENT) {
    return DIAGNOSIS_COPY.inconclusive;
  }

  const ownedShare = mix.find((entry) => entry.sourceType === "owned")?.sharePct ?? 0;

  // Если моделей больше интересуют собственные страницы клиента, проблема
  // на его домене; иначе разрыв создают сторонние площадки.
  if (ownedShare >= 50) {
    return DIAGNOSIS_COPY.ownedGap;
  }

  return DIAGNOSIS_COPY.thirdPartyGap;
}

export function diagnose(facts: CitationFact[], limit = 25): Diagnosis {
  const mix = computeSourceMix(facts);
  const influential = rankInfluentialSources(facts, limit);
  const gap = computeSourceGap(influential);

  return {
    mix,
    influential,
    gap,
    statement: buildStatement(mix, gap),
    evidenceNote: DIAGNOSIS_COPY.evidenceNote,
  };
}
