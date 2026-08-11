/** Контракт C2 (TASKS.md). Менять только осознанно, с обновлением TASKS.md. */

export type Sentiment = "positive" | "neutral" | "negative";

export interface ParsedMention {
  /** Каноническое имя из brand_names/competitor_names, а не то, как оно написано в ответе. */
  name: string;
  /** 1-based порядок появления в ответе. */
  position: number;
  sentiment: Sentiment;
  isClient: boolean;
  isCompetitor: boolean;
}

export interface ParsedCitationUrl {
  url: string;
  title?: string;
}

export interface ParsedResponse {
  mentions: ParsedMention[];
  citationUrls: ParsedCitationUrl[];
}

/** Что известно о клиенте на момент разбора ответа. */
export interface EntityDictionary {
  /** Первый элемент считается каноническим написанием. */
  brandNames: string[];
  competitorNames: string[];
}

/**
 * Обогащение разбора моделью (тональность и пропущенные упоминания).
 * В тестах подставляется mock — сеть в тестах не используется никогда.
 */
export interface LlmExtractor {
  extract(text: string, dictionary: EntityDictionary): Promise<ParsedMention[]>;
}
