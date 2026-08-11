import { classifyDomain, normalizeDomain, type SourceType } from "./domains";

/**
 * Классификация доменов, которых нет в словаре.
 *
 * За интерфейсом — как и все внешние вызовы (CLAUDE.md). В тестах и в mock-режиме
 * работает детерминированная эвристика, в проде подключается модель.
 */

export interface SourceHints {
  /** Заголовок процитированной страницы, если платформа его вернула. */
  title?: string;
}

export interface SourceClassifier {
  /** Возвращает тип или null, если уверенности нет. Null честнее выдумки. */
  classify(domain: string, hints?: SourceHints): Promise<SourceType | null>;
}

/** Подсказки в домене и заголовке, по которым тип угадывается без модели. */
const HEURISTICS: [RegExp, SourceType][] = [
  [/\b(blog|news|magazine|journal|press|media|review[s]?-site)\b/, "editorial"],
  [/\b(forum|community|discuss|board)\b/, "ugc"],
  [/\b(docs?|documentation|developer[s]?|api|manual)\b/, "documentation"],
  [/\b(directory|catalog|listing|alternatives?|compare|comparison)\b/, "directory"],
  [/\b(review[s]?|rating[s]?|testimonial[s]?)\b/, "review"],
  [/\b(shop|store|catalogue|feed|pricing)\b/, "product_feed"],
];

/**
 * Детерминированная замена модели. Не притворяется умной: если подсказок нет,
 * возвращает null, и домен остаётся неклассифицированным — это видно в данных
 * и честнее, чем массово помечать всё "other".
 */
export class HeuristicSourceClassifier implements SourceClassifier {
  classify(domain: string, hints: SourceHints = {}): Promise<SourceType | null> {
    const haystack = `${normalizeDomain(domain)} ${hints.title ?? ""}`.toLowerCase();

    for (const [pattern, type] of HEURISTICS) {
      if (pattern.test(haystack)) {
        return Promise.resolve(type);
      }
    }

    return Promise.resolve(null);
  }
}

/**
 * Кэш по домену поверх любого классификатора.
 *
 * Домен классифицируется один раз на всю платформу: без кэша каждое агентство
 * платило бы модели за один и тот же g2.com заново, а таких доменов в выдаче
 * десятки на каждый прогон.
 */
export class CachingSourceClassifier implements SourceClassifier {
  private readonly cache = new Map<string, SourceType | null>();

  constructor(private readonly inner: SourceClassifier) {}

  async classify(domain: string, hints?: SourceHints): Promise<SourceType | null> {
    const key = normalizeDomain(domain);
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    const result = await this.inner.classify(domain, hints);
    this.cache.set(key, result);
    return result;
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Полная цепочка: сначала словарь (бесплатно и точно), затем классификатор.
 * Порядок важен — модель не должна переопределять известный домен.
 */
export async function classifySource(
  domain: string,
  classifier: SourceClassifier,
  options: { clientDomain?: string; title?: string } = {},
): Promise<{ type: SourceType | null; by: "rule" | "model" | null }> {
  const byRule = classifyDomain(domain, {
    ...(options.clientDomain ? { clientDomain: options.clientDomain } : {}),
  });
  if (byRule) {
    return { type: byRule, by: "rule" };
  }

  const byModel = await classifier.classify(domain, {
    ...(options.title ? { title: options.title } : {}),
  });
  return byModel ? { type: byModel, by: "model" } : { type: null, by: null };
}
