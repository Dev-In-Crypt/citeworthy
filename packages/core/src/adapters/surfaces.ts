import { ASSISTANTS, type Assistant } from "./catalogue";

/**
 * Что нужно, чтобы начать измерять ещё одну поверхность.
 *
 * Каталог ассистентов отвечает на вопрос «спрашиваем ли мы её сейчас».
 * Здесь — ответ на следующий: «почему нет и что для этого требуется». Разница
 * важная: «не спрашиваем, потому что нет ключа» и «не спрашиваем, потому что
 * поверхность не отдаёт ответы по API» — разные вещи для того, кто решает,
 * во что вкладываться.
 *
 * Ни одна поверхность здесь не получает выдуманных данных. Пока провайдера
 * нет, ассистент остаётся `measurable: false`, и интерфейс говорит
 * `MEASUREMENT_COPY.notMeasured` — «не спрашивали, поэтому сказать нечего».
 */

export type SurfaceRequirement =
  /** Ответы приходят через собственный API поверхности — нужен только ключ. */
  | "platform-api-key"
  /**
   * Поверхность не отдаёт ответы программно: их видно только в выдаче.
   * Нужен внешний поставщик результатов поиска, который умеет их снимать.
   */
  | "serp-provider"
  /**
   * API есть и работает, но условия поставщика запрещают то, ради чего
   * продукт существует: анализировать ответы и хранить их, чтобы цифру
   * можно было перепроверить. Ключ здесь ничего не решает.
   */
  | "terms-forbid"
  /** Уже измеряется. */
  | "none";

export interface SurfaceCapability extends Assistant {
  requirement: SurfaceRequirement;
  /** Что именно мешает, словами, которые можно показать человеку. */
  note: string;
  /** Готова ли остальная система принять эту поверхность. */
  pipelineReady: boolean;
}

const NOTES: Record<string, { requirement: SurfaceRequirement; note: string; ready: boolean }> = {
  chatgpt: { requirement: "none", note: "Measured through the platform API.", ready: true },
  perplexity: { requirement: "none", note: "Measured through the platform API.", ready: true },
  gemini: {
    requirement: "terms-forbid",
    /**
     * Прочитано 2026-09-24 в условиях Google. Запрещено анализировать
     * результаты, собирать из них ссылки программными средствами и строить
     * индекс; хранить разрешено до двух лет и только чтобы улучшить их
     * отображение. Корпоративный вариант этих ограничений не снимает — он
     * убирает логирование на стороне Google, а не наши обязательства.
     *
     * Что менять, если условия изменятся: `measurable: true` здесь и в
     * каталоге, вернуть регистрацию в adapters/live. Сам адаптер цел.
     */
    note: "Google's terms for grounded search do not allow the results to be analysed or kept the way this product keeps every answer so a figure can be rechecked. The adapter works; the terms are the blocker.",
    ready: true,
  },
  "ai-overviews": {
    requirement: "serp-provider",
    /**
     * TODO — граница интеграции, ровно одна:
     * реализовать SerpProvider поверх стороннего поставщика выдачи, который
     * возвращает блок AI Overview для запроса и региона, и зарегистрировать
     * адаптер. Всё, что ниже адаптера — разбор, источники, срезы, возможности —
     * уже работает с любой поверхностью: матрица фильтрует по каталогу, а
     * снимки ключуются по platform без частных случаев.
     *
     * Что нужно поменять при появлении провайдера: Platform в adapters/types
     * (контракт C1), enum platform в схеме БД + миграция, файл адаптера,
     * ветку в adapters/live, `measurable: true` здесь и в каталоге.
     */
    note: "Google does not return AI Overviews through an API. Measuring it needs a search-results provider that captures the block for a query and region.",
    ready: true,
  },
  "ai-mode": {
    requirement: "serp-provider",
    note: "Same as AI Overviews: no API, so it needs a search-results provider.",
    ready: true,
  },
  claude: { requirement: "none", note: "Measured through the platform API.", ready: true },
  copilot: {
    requirement: "serp-provider",
    note: "No API for the answer surface; needs a provider that captures it.",
    ready: true,
  },
  grok: { requirement: "none", note: "Measured through the platform API.", ready: true },
};

export function surfaceCapabilities(): SurfaceCapability[] {
  return ASSISTANTS.map((assistant) => {
    const entry = NOTES[assistant.id];

    return {
      ...assistant,
      requirement: entry?.requirement ?? "platform-api-key",
      note: entry?.note ?? "Not measured yet.",
      pipelineReady: entry?.ready ?? false,
    };
  });
}

export class SurfaceProviderNotConfiguredError extends Error {
  constructor(surface: string) {
    super(
      `No provider is configured for "${surface}". It is listed as not measured, and no figure is produced for it.`,
    );
    this.name = "SurfaceProviderNotConfiguredError";
  }
}

/**
 * Поставщик результатов поиска для поверхностей без API.
 *
 * Интерфейс объявлен заранее, реализации нет. Это осознанно: заглушка,
 * возвращающая правдоподобные ответы, попала бы в срезы и стала бы
 * измерением, которого не было.
 */
export interface SerpProvider {
  readonly id: string;
  /** Снимает блок ответа поверхности для запроса и региона. */
  fetchAnswer(input: {
    query: string;
    surface: string;
    geo?: string;
  }): Promise<{ text: string; citations: { url: string; title?: string }[] }>;
}

export class UnconfiguredSerpProvider implements SerpProvider {
  readonly id = "unconfigured";

  async fetchAnswer(input: { query: string; surface: string }): Promise<never> {
    throw new SurfaceProviderNotConfiguredError(input.surface);
  }
}
