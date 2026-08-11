import type { Citation } from "../adapters/types";
import { mentionsFromText } from "./matcher";
import type { EntityDictionary, LlmExtractor, ParsedMention, ParsedResponse } from "./types";

/** Домен без www — ключ, по которому источники группируются и классифицируются (T30). */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Объединяет детерминированные упоминания с уточнением от модели.
 * Детерминированный проход — источник истины по составу упоминаний;
 * модель может уточнить тональность, но не может выдумать сущность,
 * которой нет в словаре клиента. Иначе метрика начнёт зависеть от галлюцинаций.
 */
export function mergeMentions(
  deterministic: ParsedMention[],
  fromLlm: ParsedMention[],
): ParsedMention[] {
  const sentimentByName = new Map(fromLlm.map((m) => [m.name.toLowerCase(), m.sentiment]));

  return deterministic.map((mention) => ({
    ...mention,
    sentiment: sentimentByName.get(mention.name.toLowerCase()) ?? mention.sentiment,
  }));
}

export interface ParseOptions {
  llm?: LlmExtractor;
}

/** Контракт C2: разбор одного ответа платформы. */
export async function parseResponse(
  text: string,
  citations: Citation[],
  dictionary: EntityDictionary,
  options: ParseOptions = {},
): Promise<ParsedResponse> {
  const deterministic = mentionsFromText(text, dictionary);

  let mentions = deterministic;
  if (options.llm) {
    try {
      mentions = mergeMentions(deterministic, await options.llm.extract(text, dictionary));
    } catch {
      // Падение модели не должно ронять разбор: состав упоминаний уже известен,
      // теряется только уточнение тональности.
      mentions = deterministic;
    }
  }

  const seen = new Set<string>();
  const citationUrls = citations
    .filter((citation) => {
      const key = citation.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((citation) => ({ url: citation.url, ...(citation.title ? { title: citation.title } : {}) }));

  return { mentions, citationUrls };
}
