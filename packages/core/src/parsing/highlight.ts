import type { EntityDictionary } from "./types";

/**
 * Подсветка упоминаний в сыром ответе платформы.
 *
 * Это не украшение: возможность увидеть, из какого именно текста получилась
 * цифра, — единственный способ для агентства проверить измерение. Поэтому
 * подсветка обязана использовать те же правила сопоставления, что и парсер,
 * иначе интерфейс показывал бы одно, а метрика считала другое.
 */

export type SegmentKind = "plain" | "client" | "competitor";

export interface HighlightSegment {
  text: string;
  kind: SegmentKind;
  /** Каноническое имя сущности для подсказки; для plain — undefined. */
  entity?: string;
}

interface Occurrence {
  start: number;
  end: number;
  kind: Exclude<SegmentKind, "plain">;
  entity: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasUppercase(value: string): boolean {
  return /[A-Z]/.test(value);
}

/** Все вхождения алиаса с границами слова и правилом собственных имён (см. matcher.ts). */
export function findAllAliasOccurrences(text: string, alias: string): [number, number][] {
  const trimmed = alias.trim();
  if (trimmed === "") return [];

  const flags = hasUppercase(trimmed) ? "gu" : "giu";
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`,
    flags,
  );

  const found: [number, number][] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    found.push([match.index, match.index + match[0].length]);
    if (match.index === pattern.lastIndex) {
      pattern.lastIndex++;
    }
  }
  return found;
}

/**
 * Разбивает текст на сегменты. Пересекающиеся совпадения разрешаются в пользу
 * более длинного: «Acme CRM» должно подсветиться целиком, а не как «Acme» плюс хвост.
 */
export function highlightMentions(text: string, dictionary: EntityDictionary): HighlightSegment[] {
  const canonicalBrand = dictionary.brandNames[0];
  const occurrences: Occurrence[] = [];

  if (canonicalBrand) {
    for (const alias of dictionary.brandNames) {
      for (const [start, end] of findAllAliasOccurrences(text, alias)) {
        occurrences.push({ start, end, kind: "client", entity: canonicalBrand });
      }
    }
  }

  for (const competitor of dictionary.competitorNames) {
    for (const [start, end] of findAllAliasOccurrences(text, competitor)) {
      occurrences.push({ start, end, kind: "competitor", entity: competitor });
    }
  }

  // Сначала по позиции, при равной позиции — длинное вперёд.
  occurrences.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const selected: Occurrence[] = [];
  let cursor = 0;
  for (const occurrence of occurrences) {
    if (occurrence.start >= cursor) {
      selected.push(occurrence);
      cursor = occurrence.end;
    }
  }

  const segments: HighlightSegment[] = [];
  let position = 0;

  for (const occurrence of selected) {
    if (occurrence.start > position) {
      segments.push({ text: text.slice(position, occurrence.start), kind: "plain" });
    }
    segments.push({
      text: text.slice(occurrence.start, occurrence.end),
      kind: occurrence.kind,
      entity: occurrence.entity,
    });
    position = occurrence.end;
  }

  if (position < text.length) {
    segments.push({ text: text.slice(position), kind: "plain" });
  }

  return segments;
}
