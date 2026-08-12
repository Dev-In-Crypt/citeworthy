import { describe, expect, it, vi } from "vitest";
import {
  countGeminiSearches,
  extractGeminiCitations,
  extractGeminiText,
  GeminiAdapter,
  GEMINI_PRICING,
  geminiCostUsd,
} from "./gemini";

/**
 * Verify T15. Сеть не используется: fetch подменяется.
 *
 * ВАЖНО: форма ответа взята из документации Interactions API, а не с живого
 * вызова — ключа на момент написания не было. Пока живой прогон не сделан,
 * тесты доказывают только то, что мы правильно читаем ожидаемый формат.
 */

const FLASH = GEMINI_PRICING["gemini-3.6-flash"]!;

function apiResponse(overrides: Record<string, unknown> = {}) {
  return {
    model: "gemini-3.6-flash",
    steps: [
      { type: "thought" },
      { type: "google_search_call", arguments: { queries: ["best crm for startups"] } },
      { type: "google_search_result", search_suggestions: "<div>…</div>" },
      { type: "google_search_call", arguments: { queries: ["crm pricing comparison"] } },
      { type: "google_search_result", search_suggestions: "<div>…</div>" },
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: "Startups most often pick HubSpot, with Pipedrive and AcmeCRM close behind.",
            annotations: [
              {
                type: "url_citation",
                url: "https://www.g2.com/categories/crm",
                title: "Best CRM Software",
                start_index: 0,
                end_index: 40,
              },
              {
                type: "url_citation",
                url: "https://www.hubspot.com/products/crm",
                title: "HubSpot CRM",
                start_index: 41,
                end_index: 72,
              },
              // Тот же источник процитирован дважды.
              {
                type: "url_citation",
                url: "https://www.g2.com/categories/crm",
                title: "Best CRM Software",
                start_index: 73,
                end_index: 90,
              },
            ],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1_200,
      output_tokens: 900,
      tool_use_input_tokens: 14_500,
      total_tokens: 16_600,
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
  return new GeminiAdapter({
    apiKey: "test-key",
    fetchImpl,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

describe("geminiCostUsd", () => {
  it("токены инструмента считаются как входные", () => {
    // (1200 + 14500)/1e6*1.5 + 900/1e6*7.5 + 2/1000*14 = 0.023550 + 0.006750 + 0.028.
    const cost = geminiCostUsd(
      { input_tokens: 1_200, output_tokens: 900, tool_use_input_tokens: 14_500 },
      2,
      FLASH,
    );

    expect(cost).toBeCloseTo(0.05830, 5);
  });

  it("здесь, в отличие от OpenAI, токены весят больше поиска", () => {
    const usage = { input_tokens: 1_200, output_tokens: 900, tool_use_input_tokens: 14_500 };

    const tokensOnly = geminiCostUsd(usage, 0, FLASH);
    const searchOnly = geminiCostUsd(usage, 2, FLASH) - tokensOnly;

    expect(searchOnly).toBeCloseTo(0.028, 6);
    // У Luna поиск съедал 80% чека; у Gemini токены дороже втрое, и картина
    // обратная. Значит, приём «экономим на числе поисков» тут почти не работает.
    expect(tokensOnly).toBeGreaterThan(searchOnly);
  });

  it("бесплатный месячный лимит поисков не вычитается", () => {
    // Лимит общий на аккаунт, а считаем мы один ответ: занизить расход опаснее,
    // чем завысить — на этих цифрах агентство назначает цену клиенту.
    expect(geminiCostUsd({ input_tokens: 0, output_tokens: 0 }, 1, FLASH)).toBeCloseTo(0.014, 6);
  });

  it("пустой расход даёт ноль", () => {
    expect(geminiCostUsd({}, 0, FLASH)).toBe(0);
  });
});

describe("разбор ответа", () => {
  it("текст берётся из шага model_output", () => {
    expect(extractGeminiText(apiResponse())).toContain("HubSpot");
  });

  it("служебные шаги в текст не попадают", () => {
    // search_suggestions — это HTML-виджет Google, а не ответ модели.
    expect(extractGeminiText(apiResponse())).not.toContain("div");
  });

  it("цитаты схлопываются по URL", () => {
    const citations = extractGeminiCitations(apiResponse());

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      url: "https://www.g2.com/categories/crm",
      title: "Best CRM Software",
    });
  });

  it("вызовы поиска считаются по шагам", () => {
    expect(countGeminiSearches(apiResponse())).toBe(2);
    expect(countGeminiSearches({ steps: [] })).toBe(0);
  });
});

describe("GeminiAdapter", () => {
  it("возвращает результат по контракту C1", async () => {
    const fetchImpl = fetchReturning(apiResponse());
    const result = await adapter(fetchImpl as unknown as typeof fetch).execute("best CRM");

    expect(result.text).toContain("Pipedrive");
    expect(result.citations).toHaveLength(2);
    expect(result.modelVersion).toBe("gemini-3.6-flash");
    expect(result.costUsd).toBeCloseTo(0.05830, 5);
  });

  it("поиск включён, ключ идёт заголовком, а не в query", async () => {
    const fetchImpl = fetchReturning(apiResponse());
    await adapter(fetchImpl as unknown as typeof fetch).execute("best CRM for startups");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools: unknown[]; input: string };

    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    // Ключ в query утёк бы в логи прокси.
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(body.tools).toEqual([{ type: "google_search" }]);
    expect(body.input).toBe("best CRM for startups");
  });

  it("повторяет попытку на 429", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve("quota") })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiResponse()),
        text: () => Promise.resolve(""),
      });

    const result = await adapter(fetchImpl as unknown as typeof fetch).execute("prompt");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.citations).toHaveLength(2);
  });

  it("сдаётся после трёх попыток на 500", async () => {
    const fetchImpl = fetchReturning("server error", 500);

    await expect(adapter(fetchImpl as unknown as typeof fetch).execute("prompt")).rejects.toThrow(
      /500/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("на 403 не повторяет: доступ сам не появится", async () => {
    const fetchImpl = fetchReturning("forbidden", 403);

    await expect(adapter(fetchImpl as unknown as typeof fetch).execute("prompt")).rejects.toThrow(
      /403/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ответ без model_output — ошибка, а не пустое измерение", async () => {
    const fetchImpl = fetchReturning(apiResponse({ steps: [{ type: "thought" }] }));

    await expect(adapter(fetchImpl as unknown as typeof fetch).execute("prompt")).rejects.toThrow(
      /no answer text/,
    );
  });

  it("без ключа адаптер не создаётся", () => {
    expect(() => new GeminiAdapter({ apiKey: "" })).toThrow(/GEMINI_API_KEY/);
  });

  it("модель без прайса отклоняется", () => {
    expect(() => new GeminiAdapter({ apiKey: "k", model: "gemini-future" })).toThrow(/pricing/i);
  });
});
