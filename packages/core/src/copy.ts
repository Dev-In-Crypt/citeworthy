/**
 * Формулировки, которые видит агентство и его клиент.
 *
 * Инвариант 2 (CLAUDE.md): слова, заявляющие доказанную причинность, запрещены —
 * их точный список и машинная проверка живут в copy.honesty.test.ts.
 * Разрешены «estimated», «confidence», «evidence». Причина не в юридической
 * осторожности: спек прямо запрещает изображать причинность, которой нет —
 * измерить её на одном клиенте невозможно, а обещание, которое нельзя сдержать,
 * стоит агентству отношений с его собственным клиентом.
 *
 * Все такие строки живут здесь, а не в компонентах, чтобы их можно было
 * проверить одним grep-тестом (T46).
 */

export const CONFIDENCE_LABELS = {
  low: "Confidence: low",
  medium: "Confidence: medium",
  high: "Confidence: high",
} as const;

export const MEASUREMENT_COPY = {
  /** Показывается рядом с любой цифрой, посчитанной по недобору сэмплов. */
  insufficientSamples:
    "Fewer answers than the minimum for this window. Treat the number as indicative, not as a measurement.",
  /** Пояснение, как считается видимость. */
  visibilityBasis:
    "Share of answers in the period mentioning the brand, across every sample taken. Never a single answer.",
  noDataYet: "No measurements yet",
} as const;

export const DIAGNOSIS_COPY = {
  /** Основной вывод: разрыв создаётся сторонними источниками. */
  thirdPartyGap:
    "The gap is driven by third-party sources rather than by a shortage of owned content.",
  /** Основной вывод: разрыв на собственных страницах. */
  ownedGap:
    "Models mostly cite owned pages here, so the gap points at the client's own content rather than at outside sources.",
  /** Данных не хватает для вывода. */
  inconclusive:
    "Not enough cited sources yet to say where the gap comes from. More runs will make this readable.",
  /** Приписка к любому выводу. */
  evidenceNote: "Based on the sources models actually cited in the measured period.",
} as const;

export const REPORT_COPY = {
  /**
   * Идёт в каждый отчёт: клиент должен понимать, что именно измерено.
   *
   * Формулировка на несколько платформ — только для случая, когда их
   * действительно было несколько. Собирать её надо через
   * `measurementBasisFor`, а не брать константу наугад: отчёт по одной
   * платформе, утверждающий «several platforms», — ровно то ложное
   * утверждение, ради запрета которого существует инвариант 2.
   */
  measurementBasis:
    "Visibility is the share of AI answers mentioning the brand, measured across repeated samples on several platforms over weekly windows.",
  /** Тот же смысл, но для одной платформы; %PLATFORM% подставляется. */
  measurementBasisSinglePlatform:
    "Visibility is the share of %PLATFORM% answers mentioning the brand, measured across repeated samples over weekly windows. Other assistants were not measured for this report.",
  /** Ставится, когда движение нельзя отделить от общего дрейфа платформ. */
  noComparisonGroup:
    "There were no untouched topics to compare against in this period, so movement cannot be separated from platform-wide changes.",
  /** Ставится при коротком периоде наблюдения. */
  shortPeriod:
    "Models typically take weeks to re-crawl and shift citations, so a short period shows early signal rather than settled results.",
  /** Идёт в каждый аудит: снимок «как сейчас», а не прогноз. */
  opportunityBasis:
    "This audit is a single measurement of how assistants answer today. The ranked work is what the current sources suggest, with expected effort — not a forecast of results.",
  /** Оговорка к предложенному объёму работ и деньгам. */
  scopeEstimate:
    "Retainer and effort are the agency's own estimates for the scope below, shown so the numbers behind the proposal are visible.",
} as const;

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

/**
 * Оговорка о природе измерения, собранная по факту.
 *
 * Пустой список платформ — тоже случай «нескольких»: он означает, что срезов
 * ещё нет, и обещать конкретную платформу не на чем.
 */
export function measurementBasisFor(platforms: readonly string[]): string {
  const unique = [...new Set(platforms)];
  if (unique.length !== 1) {
    return REPORT_COPY.measurementBasis;
  }

  const platform = unique[0] as string;
  return REPORT_COPY.measurementBasisSinglePlatform.replace(
    "%PLATFORM%",
    PLATFORM_LABELS[platform] ?? platform,
  );
}

export const EXPERIMENT_COPY = {
  /** Заголовок оценки эффекта: всегда «estimated» — см. инвариант 2. */
  estimatedEffect: "Estimated incremental effect",
  /** Дисклеймер под результатом эксперимента. */
  attributionLimits:
    "This is a record of what was done and what followed, shown with a platform baseline. It is evidence, not attribution of cause.",
} as const;
