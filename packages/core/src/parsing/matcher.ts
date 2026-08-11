import type { EntityDictionary, ParsedMention } from "./types";

/** Экранирование для построения регулярного выражения из произвольного алиаса. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasUppercase(value: string): boolean {
  return /[A-Z]/.test(value);
}

export interface AliasHit {
  canonical: string;
  matchedAlias: string;
  index: number;
  isClient: boolean;
  isCompetitor: boolean;
}

/**
 * Ищет вхождение алиаса с границами слова.
 *
 * Правило собственных имён: если алиас содержит заглавную букву (а бренды —
 * собственные имена), совпадение тоже должно начинаться с заглавной.
 * Без этого конкурент «Close» находился бы в обычной фразе «close the deal»,
 * и visibility конкурента раздувалась бы на пустом месте.
 */
export function findAlias(text: string, alias: string): number {
  const trimmed = alias.trim();
  if (trimmed === "") return -1;

  const flags = hasUppercase(trimmed) ? "g" : "gi";
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`, `${flags}u`);
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

/**
 * Детерминированный разбор упоминаний по словарю клиента.
 * Работает без сети и без модели — это база, на которую опирается вся метрика.
 */
export function matchEntities(text: string, dictionary: EntityDictionary): AliasHit[] {
  const groups: { canonical: string; aliases: string[]; isClient: boolean }[] = [];

  if (dictionary.brandNames.length > 0) {
    const canonical = dictionary.brandNames[0];
    if (canonical) {
      groups.push({ canonical, aliases: dictionary.brandNames, isClient: true });
    }
  }

  for (const competitor of dictionary.competitorNames) {
    groups.push({ canonical: competitor, aliases: [competitor], isClient: false });
  }

  const hits: AliasHit[] = [];

  for (const group of groups) {
    // Длинные алиасы проверяются первыми: «Acme CRM» важнее, чем «Acme»,
    // иначе позиция и написание определялись бы случайным порядком словаря.
    const aliases = [...group.aliases].sort((a, b) => b.length - a.length);

    let best: { index: number; alias: string } | null = null;
    for (const alias of aliases) {
      const index = findAlias(text, alias);
      if (index !== -1 && (best === null || index < best.index)) {
        best = { index, alias };
      }
    }

    if (best) {
      hits.push({
        canonical: group.canonical,
        matchedAlias: best.alias,
        index: best.index,
        isClient: group.isClient,
        isCompetitor: !group.isClient,
      });
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

/** Упоминания в порядке появления, по одному на сущность. */
export function mentionsFromText(text: string, dictionary: EntityDictionary): ParsedMention[] {
  return matchEntities(text, dictionary).map((hit, order) => ({
    name: hit.canonical,
    position: order + 1,
    // Тональность детерминированный проход не определяет — её уточняет модель (T18, LLM-проход).
    sentiment: "neutral" as const,
    isClient: hit.isClient,
    isCompetitor: hit.isCompetitor,
  }));
}
