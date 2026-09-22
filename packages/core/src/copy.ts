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
  /** Шапка экрана клиента: чем являются все цифры на нём. */
  methodNote:
    "Everything on this screen is estimated from repeated samples of assistant answers. No figure comes from a single answer, and nothing is published anywhere until you approve it.",
  /** Основание матрицы «промпт × ассистент». */
  matrixBasis:
    "Share of sampled answers mentioning the brand. Every cell is an aggregate over the window, never one answer.",
  /**
   * Ассистент, которого мы не спрашиваем. Формулировка обязана отличать
   * «не спрашивали» от «спросили и не нашли» — второе было бы неправдой.
   */
  notMeasured:
    "Not measured yet — we do not ask this assistant, so there is nothing to report either way.",
  /** Ячейка, где конкурента назвали, а клиента нет. */
  competitorOnly: "A tracked competitor was named in answers where the client was not.",
  /** Ячейка ниже порога сэмплов. */
  underFloor: "Under the sample floor for this window, so it shows a dash rather than a guess.",
  /**
   * Изменение, которое выборка не различает. Формулировка обязана говорить
   * про предел выборки, а не про отсутствие изменения: это разные вещи.
   */
  withinNoise: "within what this sample size can tell apart",
  /**
   * Предел метрики переходов. Стоит рядом с цифрой, а не в сноске: без этой
   * фразы её прочитают как полный счёт визитов из ассистентов.
   */
  trafficUndercount:
    "Referred sessions are undercounted: in-app browsers drop the source, and many people type the brand instead of clicking. Read this beside visibility, not as its result.",
  /**
   * Видимость и переходы стоят рядом — и это всё, что о них можно сказать.
   * «Выросло вместе» и «одно вызвало другое» — разные утверждения, и второе
   * на этих данных не проверяется никак.
   */
  observedTogether:
    "Observed during the same period. Shown side by side because both moved, not because one produced the other.",
  /** Почему в разделе движения не все вопросы. */
  movementBasis:
    "Only questions where the change is larger than this sample size can explain on its own. Anything smaller is left out rather than shown as a result.",
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
  /**
   * Предел вывода о присутствии. Мы не открываем саму страницу — мы видим, что
   * источник процитирован, и упомянут ли бренд в том же ответе. Без этой
   * оговорки «клиента нет на g2.com» читается как проверенный факт о странице.
   */
  presenceCaveat:
    "Presence is inferred from answers where the source was cited, not from checking the page itself.",
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
  claude: "Claude",
  grok: "Grok",
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

export const OPPORTUNITY_COPY = {
  /** Что это за экран. Стоит над списком, а не в подсказке. */
  basis:
    "Each opportunity is derived from measured answers: where the client is losing, on which questions, and what the cited sources suggest doing about it. Ranked by an internal score, not by certainty of outcome.",
  /** Пояснение к оценке. Никакого обещания результата. */
  scoreBasis:
    "The score ranks work against work for this client. It is not a rating of the site and not a forecast — it combines how large the gap is, how much of the tracked question set it touches, how commercial those questions are, and how well it was measured.",
  /** Подписи множителей — ровно то, чем они являются. */
  factorLabels: {
    impact: "Size of the gap",
    coverage: "Share of tracked questions",
    commercialIntent: "Commercial intent",
    actionability: "How much of it you control",
    confidence: "How well it is measured",
  },
  /**
   * Coverage — доля отслеживаемых вопросов, а не частотность запросов.
   * Данных о спросе у продукта нет, и подпись обязана это показывать.
   */
  coverageBasis:
    "Share of the questions this client tracks, not search demand — the product does not measure how often people ask them.",
  /** Оговорка над примерами ответов в доказательстве. */
  evidenceBasis:
    "Examples from the sample, shown after the aggregate. A single answer is never a result on its own.",
  /** Окно, за которое посчитана возможность. */
  windowBasis: "Measured over the window shown; the score is fixed to that window, not to today.",
  /** Возможность больше не обнаруживается. */
  resolvedNote:
    "No longer detected in the latest measurement. This is a record of what changed, not attribution of cause.",
  /** Пустой экран. */
  emptyTitle: "No opportunities yet",
  emptyBody:
    "We need enough measured answers to tell a real gap from a small sample. Run a measurement and this fills in.",
  /** Отклонение обязано иметь причину — как и снятие задачи. */
  dismissRequiresReason: "Say why this is not worth doing, so the next person does not re-open it.",
  dismissReturns:
    "A dismissed opportunity comes back only if it grows noticeably larger than it was when you dismissed it.",
  /** Отложить — не то же самое, что отказаться: срок выйдет, и пункт вернётся. */
  snoozeLabel: "Not this month",
  snoozeNote:
    "Kept out of the list until the date passes, then shown again with whatever the measurements say by then.",
} as const;

/**
 * Утверждения об измерении на публичном сайте (/, /product, /pricing,
 * /free-audit). Сайт обещает от имени продукта, поэтому его фразы о том, что
 * и как измерено, живут здесь же и проверяются тем же grep-тестом, что и
 * фразы продукта. Где смысл совпадает с продуктом, сайт берёт константы выше.
 */
export const MARKETING_COPY = {
  /** Подвал каждой страницы сайта. */
  siteBasis:
    "Every figure on this site is estimated from repeated samples of assistant answers. Example agencies, clients, competitors and *.example domains are invented.",
  /** Карточка «как сделана каждая цифра». */
  methodNote:
    "Everything is estimated from repeated samples of assistant answers. Nothing is published anywhere until you approve it.",
  /** Под недельным графиком: одна неделя — не результат. */
  readTheTrend:
    "Single weeks overlap; the change over the quarter is wider than one week's range. Read the trend, not a week.",
  /** Что значит «gap» у источника. */
  gapDefinition: "“Gap” = cited in answers that name a competitor but not the client.",
  /** Сырые ответы хранятся — инвариант 6. */
  answersStored:
    "Every answer is stored with its model version, so a parser improvement can be replayed over history.",
  /** Оценка вклада — всегда диапазон. */
  contributionAsRange: "estimated contribution, shown as a range",
  /**
   * Подпись к примеру эксперимента, где нетронутые темы были. Сравнение идёт
   * с ними, а не с «базовой линией платформы»: такого метода в продукте нет.
   */
  experimentRecord:
    "This is a record of what was done and what followed, compared with topics the work did not touch. It is evidence, not attribution of cause.",
  /** Как работает эксперимент — описание метода (контракт C5). */
  experimentMethod:
    "Log the date a change went live. The product compares the topics it touched with the topics you left alone, over the same weeks, and shows the difference as a range with a confidence level. It is a record of what followed, not a claim about why.",
  /** Без нетронутых тем сравнивать не с чем, и отчёт это говорит. */
  experimentWithoutControl:
    "Without untouched topics there is nothing to compare against, and the report says so instead of showing a difference.",
  /** Кого не измеряем и почему. */
  notMeasuredSurfaces:
    "Microsoft Copilot and Google AI Overviews / AI Mode offer no public API, so they are not measured, and no report estimates them.",
  /** Пределы, названные вслух на главной. */
  limits: {
    quarter:
      "Models re-crawl and re-cite over weeks. Sixty to ninety days is the honest unit here; a short period shows early signal rather than settled results.",
    attribution:
      "With one client and no untouched topics to compare against, movement cannot be separated from platform-wide drift, and the report says so where that is the case.",
    ranges:
      "Estimated contribution is shown as a range next to a confidence level, because that is what the data supports.",
    revenue:
      "Visibility is a share of answers. What that share is worth belongs to your client's model, not to ours.",
    nothingPublished:
      "The product reads what assistants already answer and tells you what it found. Anything that changes a client's site stays a human decision.",
  },
  /** Аудит: снимок, а не прогноз. */
  auditNotForecast:
    "The ranked work is what the current sources suggest, with expected effort. It does not predict what share of answers the client will reach.",
  auditSnapshot:
    "One pass shows where the client stands this week. Movement needs repeated weekly samples; sixty to ninety days is the honest unit.",
} as const;

export const EXPERIMENT_COPY = {
  /** Заголовок оценки эффекта: всегда «estimated» — см. инвариант 2. */
  estimatedEffect: "Estimated incremental effect",
  /** Дисклеймер под результатом эксперимента. */
  attributionLimits:
    "This is a record of what was done and what followed, shown with a platform baseline. It is evidence, not attribution of cause.",
} as const;
