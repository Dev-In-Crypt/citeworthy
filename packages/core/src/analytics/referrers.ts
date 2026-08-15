import { normalizeDomain } from "../sources/domains";

/**
 * Откуда пришёл переход, если пришёл от ассистента.
 *
 * Соответствие хостов ассистентам держится списком, а не догадкой по
 * подстроке: домен, который просто содержит «ai», не является ассистентом,
 * и записать чужой трафик себе в заслугу продукт не должен.
 *
 * Важно понимать предел этой метрики. Переходы от ассистентов
 * систематически недосчитываются: встроенные браузеры не передают источник,
 * а часть людей просто набирает название бренда руками. Поэтому это второе
 * наблюдение рядом с видимостью, а не её следствие.
 */

export const ASSISTANT_REFERRERS: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "openai.com": "chatgpt",
  "perplexity.ai": "perplexity",
  "www.perplexity.ai": "perplexity",
  "gemini.google.com": "gemini",
  "bard.google.com": "gemini",
  "claude.ai": "claude",
  "copilot.microsoft.com": "copilot",
  "bing.com": "copilot",
  "grok.com": "grok",
  "x.ai": "grok",
};

/** Ассистент по хосту источника перехода; null — переход не от ассистента. */
export function classifyReferrer(referrer: string): string | null {
  const host = normalizeDomain(referrer);
  if (!host) {
    return null;
  }

  return ASSISTANT_REFERRERS[host] ?? null;
}

export interface TrafficRow {
  /** Дата в UTC, начало дня. */
  day: Date;
  assistant: string;
  sessions: number;
}

export interface TrafficSummaryEntry {
  assistant: string;
  sessions: number;
  sharePct: number;
}

export interface TrafficSummary {
  totalSessions: number;
  byAssistant: TrafficSummaryEntry[];
  from: Date;
  to: Date;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Свёртка по ассистентам за окно. Чистая функция — окно задаёт вызывающий. */
export function summariseTraffic(
  rows: readonly TrafficRow[],
  from: Date,
  to: Date,
): TrafficSummary {
  const totals = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    const at = row.day.getTime();
    if (at < from.getTime() || at > to.getTime()) {
      continue;
    }

    totals.set(row.assistant, (totals.get(row.assistant) ?? 0) + row.sessions);
    total += row.sessions;
  }

  const byAssistant = [...totals.entries()]
    .map(([assistant, sessions]) => ({
      assistant,
      sessions,
      sharePct: total === 0 ? 0 : round1((sessions / total) * 100),
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return { totalSessions: total, byAssistant, from, to };
}
