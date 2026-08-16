import { classifyDomain, isSameOrSubdomain, normalizeDomain } from "../sources/domains";

/**
 * Кого ещё стоит отслеживать.
 *
 * Список конкурентов агентство вводит руками, и в первом же аудите он почти
 * всегда неполный: модели называют компании, о которых агентство не подумало.
 * Придумывать их нельзя — но и не нужно: они уже есть в данных.
 *
 * Кандидат — домен, который модели цитируют, отвечая на вопросы этого клиента,
 * и который не является ни площадкой отзывов, ни каталогом, ни форумом, ни
 * СМИ, ни доменом самого клиента. То есть чей-то продуктовый сайт. Это
 * наблюдение, а не вывод: решение остаётся за человеком, и формулировка
 * обязана это показывать.
 */

/** Типы источников, которые заведомо не являются вендорами. */
const NOT_A_VENDOR = new Set([
  "review",
  "directory",
  "ugc",
  "social",
  "editorial",
  "owned",
  "inaccessible",
]);

export interface CitedDomainFact {
  domain: string;
  /** Тип источника, если он уже определён. */
  sourceType: string | null;
}

export interface CompetitorCandidate {
  domain: string;
  /** В скольких ответах домен процитирован. */
  citations: number;
  /** Похоже ли имя на уже отслеживаемого конкурента. */
  alreadyTracked: boolean;
}

/** Ниже этого числа цитирований домен — случайность, а не участник рынка. */
export const MIN_CITATIONS_FOR_CANDIDATE = 2;

export function suggestCompetitors(
  facts: readonly CitedDomainFact[],
  options: { clientDomain: string; trackedNames: readonly string[]; limit?: number },
): CompetitorCandidate[] {
  const clientDomain = normalizeDomain(options.clientDomain);
  const tracked = options.trackedNames.map((name) => name.toLowerCase().replace(/\s+/g, ""));

  const counts = new Map<string, number>();

  for (const fact of facts) {
    const domain = normalizeDomain(fact.domain);
    if (!domain || isSameOrSubdomain(domain, clientDomain)) continue;

    const type = fact.sourceType ?? classifyDomain(domain, { clientDomain });
    if (type !== null && NOT_A_VENDOR.has(type)) continue;

    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, citations]) => citations >= MIN_CITATIONS_FOR_CANDIDATE)
    .map(([domain, citations]) => ({
      domain,
      citations,
      // Имя конкурента и его домен — разные строки; сравниваем по корню домена,
      // чтобы «Pipedrive» и pipedrive.com не предлагались как новинка.
      alreadyTracked: tracked.some((name) => domain.replace(/\..*$/, "") === name),
    }))
    .sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain))
    .slice(0, options.limit ?? 10);
}
