import type { AdapterOptions, AdapterResult, Citation, PlatformAdapter } from "./types";
import { adapterResultSchema } from "./types";

/**
 * Живой адаптер Perplexity (Sonar).
 *
 * Поиск здесь не опция, а сам продукт: Sonar всегда отвечает по свежей выдаче
 * и возвращает список источников. Поэтому, в отличие от OpenAI, включать
 * инструмент не нужно — нужно правильно прочитать то, что уже пришло.
 *
 * Эндпоинт вынесен в конфиг: у Perplexity сейчас соседствуют Sonar
 * (`/v1/sonar`) и новый Agent API, а в документации у Sonar стоит пометка о
 * миграции. Когда путь сменится, это правка переменной окружения, а не релиз.
 */

export const DEFAULT_PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/v1/sonar";

/** Модель по умолчанию — базовая: нам нужен типичный ответ, а не исследование. */
export const DEFAULT_PERPLEXITY_MODEL = "sonar";

export interface PerplexityPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Плата за запрос зависит от размера поискового контекста. */
  requestPerThousand: { low: number; medium: number; high: number };
}

export const PERPLEXITY_PRICING: Record<string, PerplexityPricing> = {
  sonar: {
    inputPerMillion: 1,
    outputPerMillion: 1,
    requestPerThousand: { low: 5, medium: 8, high: 12 },
  },
  "sonar-pro": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    requestPerThousand: { low: 6, medium: 10, high: 14 },
  },
};

export interface PerplexityUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  citation_tokens?: number;
  num_search_queries?: number;
  search_context_size?: string;
  /** Perplexity считает стоимость сама; форма объекта в документации не закреплена. */
  cost?: { total_cost?: number } & Record<string, unknown>;
}

/**
 * Стоимость ответа.
 *
 * Если провайдер прислал свою цифру — берём её: она точнее любого нашего
 * прайса и переживёт смену тарифов. Свой расчёт остаётся запасным путём,
 * потому что записать ноль вместо стоимости нельзя (это скрытый убыток).
 */
export function perplexityCostUsd(usage: PerplexityUsage, pricing: PerplexityPricing): number {
  const reported = usage.cost?.total_cost;
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) {
    return Math.round(reported * 1_000_000) / 1_000_000;
  }

  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  // Токены цитат тарифицируются как входные: они и есть подтянутый в контекст текст.
  const citation = usage.citation_tokens ?? 0;
  const requests = usage.num_search_queries ?? 0;

  const context = usage.search_context_size?.toLowerCase();
  const perThousand =
    context === "high"
      ? pricing.requestPerThousand.high
      : context === "low"
        ? pricing.requestPerThousand.low
        : pricing.requestPerThousand.medium;

  const total =
    ((input + citation) / 1_000_000) * pricing.inputPerMillion +
    (output / 1_000_000) * pricing.outputPerMillion +
    (requests / 1000) * perThousand;

  return Math.round(total * 1_000_000) / 1_000_000;
}

interface PerplexityPayload {
  model?: string;
  choices?: { message?: { content?: string } }[];
  /** Старый формат: просто список URL. */
  citations?: string[];
  /** Новый формат: объекты с заголовком и датой. */
  search_results?: { url?: string; title?: string }[];
  usage?: PerplexityUsage;
}

export function extractPerplexityText(payload: PerplexityPayload): string {
  return (payload.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * Источники читаются из обоих полей: `search_results` даёт заголовки, а
 * `citations` остаётся у старых ответов. Дубли схлопываются по URL — нам
 * важен факт цитирования, а не сколько раз модель на него сослалась.
 */
export function extractPerplexityCitations(payload: PerplexityPayload): Citation[] {
  const seen = new Map<string, Citation>();

  for (const result of payload.search_results ?? []) {
    if (!result.url || seen.has(result.url)) continue;
    seen.set(result.url, {
      url: result.url,
      ...(result.title ? { title: result.title } : {}),
    });
  }

  for (const url of payload.citations ?? []) {
    if (!url || seen.has(url)) continue;
    seen.set(url, { url });
  }

  return [...seen.values()];
}

export interface PerplexityAdapterConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  pricing?: PerplexityPricing;
  /** Подменяется в тестах: сеть в них не используется никогда. */
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PerplexityAdapter implements PlatformAdapter {
  readonly platform = "perplexity" as const;

  private readonly model: string;
  private readonly endpoint: string;
  private readonly pricing: PerplexityPricing;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(private readonly config: PerplexityAdapterConfig) {
    if (!config.apiKey) {
      throw new Error("PERPLEXITY_API_KEY is not set. Use ADAPTERS_MODE=mock or provide the key.");
    }

    this.model = config.model ?? DEFAULT_PERPLEXITY_MODEL;
    const pricing = config.pricing ?? PERPLEXITY_PRICING[this.model];
    if (!pricing) {
      throw new Error(
        `No pricing for Perplexity model "${this.model}". Add it to PERPLEXITY_PRICING, otherwise cost per answer cannot be recorded.`,
      );
    }

    this.pricing = pricing;
    this.endpoint = config.endpoint ?? DEFAULT_PERPLEXITY_ENDPOINT;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.maxAttempts = config.maxAttempts ?? 3;
    this.sleep = config.sleep ?? defaultSleep;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  async execute(prompt: string, opts?: AdapterOptions): Promise<AdapterResult> {
    const startedAt = Date.now();
    const payload = await this.request(prompt, opts);

    const text = extractPerplexityText(payload);
    if (text === "") {
      throw new Error("Perplexity returned no answer text");
    }

    return adapterResultSchema.parse({
      text,
      citations: extractPerplexityCitations(payload),
      modelVersion: payload.model ?? this.model,
      costUsd: perplexityCostUsd(payload.usage ?? {}, this.pricing),
      latencyMs: Date.now() - startedAt,
    });
  }

  private async request(prompt: string, opts?: AdapterOptions): Promise<PerplexityPayload> {
    const instructions = [
      opts?.lang ? `Answer in ${opts.lang}.` : "",
      opts?.geo ? `Assume the user is in ${opts.geo}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const body = JSON.stringify({
      model: this.model,
      messages: [
        ...(instructions ? [{ role: "system", content: instructions }] : []),
        { role: "user", content: prompt },
      ],
    });

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return (await response.json()) as PerplexityPayload;
        }

        const detail = (await response.text()).slice(0, 500);
        const error = new Error(`Perplexity responded ${response.status}: ${detail}`);

        // 4xx кроме перечисленных — наша ошибка: повтор даст тот же ответ.
        if (!RETRYABLE_STATUSES.has(response.status)) {
          throw error;
        }
        lastError = error;
      } catch (error) {
        if (error instanceof Error && /^Perplexity responded [45]\d\d/.test(error.message)) {
          const status = Number(error.message.slice(21, 24));
          if (!RETRYABLE_STATUSES.has(status)) {
            throw error;
          }
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < this.maxAttempts) {
        await this.sleep(2 ** (attempt - 1) * 1000);
      }
    }

    throw lastError ?? new Error("Perplexity request failed");
  }
}
