/**
 * Формулировки, которые видит агентство и его клиент.
 *
 * Инвариант 2 (CLAUDE.md): запрещены «proof», «proven», «guaranteed», «caused».
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

export const EXPERIMENT_COPY = {
  /** Заголовок оценки эффекта — «estimated», никогда не «proven». */
  estimatedEffect: "Estimated incremental effect",
  /** Дисклеймер под результатом эксперимента. */
  attributionLimits:
    "This is a record of what was done and what followed, shown with a platform baseline. It is evidence, not attribution of cause.",
} as const;
