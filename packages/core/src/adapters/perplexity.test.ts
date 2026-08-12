import { describe, expect, it, vi } from "vitest";
import {
  extractPerplexityCitations,
  extractPerplexityText,
  PerplexityAdapter,
  PERPLEXITY_PRICING,
  perplexityCostUsd,
} from "./perplexity";

/**
 * Verify T14. Сеть не используется: fetch подменяется.
 *
 * ВАЖНО: форма ответа взята из документации Perplexity, а не с живого вызова —
 * ключа на момент написания не было. Пока живой прогон не сделан, эти тесты
 * доказывают только то, что мы правильно читаем ожидаемый формат.
 */

const SONAR = PERPLEXITY_PRICING["sonar"]!;

function apiResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp-1",
    model: "sonar",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "For small teams the CRMs most often recommended are Pipedrive and AcmeCRM.",
        },
      },
    ],
    search_results: [
      { title: "Best CRM software", url: "https://www.g2.com/categories/crm", date: "2026-05-01" },
      { title: "Pipedrive review", url: "https://www.pipedrive.com/en/blog/crm-guide", date: null },
    ],
    citations: [
      "https://www.g2.com/categories/crm",
      "https://www.capterra.com/crm-software/",
    ],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 480,
      citation_tokens: 3_400,
      num_search_queries: 2,
      search_context_size: "medium",
    },
    ...overrides,
  };
}

function fetchReturning(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(typeof payload === "string" ? payload : JSON.stringify(payload)),
  } as Response);
}

function adapter(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new PerplexityAdapter({
    apiKey: "test-key",
    fetchImpl,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

describe("perplexityCostUsd", () => {
  it("предпочитает стоимость, посчитанную провайдером", () => {
    const cost = perplexityCostUsd(
      { prompt_tokens: 999_999, completion_tokens: 999_999, cost: { total_cost: 0.0123 } },
      SONAR,
    );

    // Своя арифметика дала бы другое число — цифра провайдера точнее и переживёт смену тарифов.
    expect(cost).toBe(0.0123);
  });

  it("считает сама, когда провайдер стоимость не прислал", () => {
    // (120 + 3400)/1e6*1 + 480/1e6*1 + 2/1000*8 = 0.00352 + 0.00048 + 0.016.
    const cost = perplexityCostUsd(
      {
        prompt_tokens: 120,
        completion_tokens: 480,
        citation_tokens: 3_400,
        num_search_queries: 2,
        search_context_size: "medium",
      },
      SONAR,
    );

    expect(cost).toBeCloseTo(0.02, 6);
  });

  it("размер поискового контекста меняет плату за запрос", () => {
    const usage = { prompt_tokens: 0, completion_tokens: 0, num_search_queries: 1 };

    expect(perplexityCostUsd({ ...usage, search_context_size: "low" }, SONAR)).toBeCloseTo(0.005, 6);
    expect(perplexityCostUsd({ ...usage, search_context_size: "high" }, SONAR)).toBeCloseTo(
      0.012,
      6,
    );
  });

  it("без размера контекста берётся medium, а не ноль", () => {
    expect(
      perplexityCostUsd({ prompt_tokens: 0, completion_tokens: 0, num_search_queries: 1 }, SONAR),
    ).toBeCloseTo(0.008, 6);
  });

  it("отрицательную стоимость от провайдера игнорирует", () => {
    const cost = perplexityCostUsd(
      { prompt_tokens: 1_000_000, completion_tokens: 0, cost: { total_cost: -5 } },
      SONAR,
    );

    expect(cost).toBe(1);
  });
});

describe("разбор ответа", () => {
  it("текст берётся из первого choice", () => {
    expect(extractPerplexityText(apiResponse())).toContain("Pipedrive and AcmeCRM");
  });

  it("источники объединяются из search_results и citations без дублей", () => {
    const citations = extractPerplexityCitations(apiResponse());

    expect(citations).toHaveLength(3);
    // Заголовок из search_results выигрывает у голого URL из citations.
    expect(citations[0]).toEqual({
      url: "https://www.g2.com/categories/crm",
      title: "Best CRM software",
    });
    expect(citations.map((c) => c.url)).toContain("https://www.capterra.com/crm-software/");
  });

  it("старый формат без search_results тоже читается", () => {
    const citations = extractPerplexityCitations(
      apiResponse({ search_results: undefined }) as Record<string, unknown>,
    );

    expect(citations).toHaveLength(2);
    expect(citations.every((c) => c.title === undefined)).toBe(true);
  });
});

describe("PerplexityAdapter", () => {
  it("возвращает результат по контракту C1", async () => {
    const fetchImpl = fetchReturning(apiResponse());
    const result = await adapter(fetchImpl as unknown as typeof fetch).execute("best CRM");

    expect(result.text).toContain("Pipedrive");
    expect(result.citations).toHaveLength(3);
    expect(result.modelVersion).toBe("sonar");
    expect(result.costUsd).toBeCloseTo(0.02, 6);
  });

  it("промпт уходит сообщением пользователя выбранной модели", async () => {
    const fetchImpl = fetchReturning(apiResponse());
    await adapter(fetchImpl as unknown as typeof fetch).execute("best CRM for startups");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
    };

    expect(url).toBe("https://api.perplexity.ai/v1/sonar");
    expect(body.model).toBe("sonar");
    expect(body.messages).toEqual([{ role: "user", content: "best CRM for startups" }]);
  });

  it("эндпоинт переопределяется: у провайдера идёт миграция на Agent API", async () => {
    const fetchImpl = fetchReturning(apiResponse());
    await adapter(fetchImpl as unknown as typeof fetch, {
      endpoint: "https://api.perplexity.ai/v1/other",
    }).execute("prompt");

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.perplexity.ai/v1/other");
  });

  it("повторяет попытку на 429 и отдаёт результат", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve("slow down") })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiResponse()),
        text: () => Promise.resolve(""),
      });

    const result = await adapter(fetchImpl as unknown as typeof fetch).execute("prompt");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.citations).toHaveLength(3);
  });

  it("сдаётся после трёх попыток на 503", async () => {
    const fetchImpl = fetchReturning("upstream down", 503);

    await expect(adapter(fetchImpl as unknown as typeof fetch).execute("prompt")).rejects.toThrow(
      /503/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("на 401 не повторяет: ключ не станет годным сам собой", async () => {
    const fetchImpl = fetchReturning("unauthorized", 401);

    await expect(adapter(fetchImpl as unknown as typeof fetch).execute("prompt")).rejects.toThrow(
      /401/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("пустой ответ — ошибка, а не пустое измерение", async () => {
    const fetchImpl = fetchReturning(apiResponse({ choices: [] }));

    await expect(adapter(fetchImpl as unknown as typeof fetch).execute("prompt")).rejects.toThrow(
      /no answer text/,
    );
  });

  it("без ключа адаптер не создаётся", () => {
    expect(() => new PerplexityAdapter({ apiKey: "" })).toThrow(/PERPLEXITY_API_KEY/);
  });

  it("модель без прайса отклоняется", () => {
    expect(() => new PerplexityAdapter({ apiKey: "k", model: "sonar-future" })).toThrow(/pricing/i);
  });
});
