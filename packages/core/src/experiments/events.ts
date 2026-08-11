/**
 * Детект событий на таймлайне эксперимента.
 *
 * Событие — это наблюдение, а не вывод. «После действия появилась новая
 * цитата» — факт; «действие вызвало цитату» — утверждение, которое продукт
 * делать не имеет права (спек, §11 ai-visibility-project).
 */

export interface CitationObservation {
  domain: string;
  /** Когда получен ответ, в котором источник процитирован. */
  observedAt: Date;
}

/** Порог, ниже которого изменение видимости не считается событием. */
export const VISIBILITY_CHANGE_THRESHOLD_PP = 5;

export interface NewCitationFinding {
  domain: string;
  observedAt: Date;
  /** Сколько дней прошло от действия до появления. */
  daysAfterAction: number;
}

/**
 * Первая цитата с домена, которого до действия в измерениях не было.
 *
 * Сравниваются множества доменов «до» и «после», а не сами цитаты: один и тот
 * же источник цитируется многократно, и без схлопывания по домену «новым»
 * оказался бы каждый повтор.
 */
export function findFirstNewCitation(
  observations: CitationObservation[],
  actionDate: Date,
): NewCitationFinding | null {
  const before = new Set<string>();
  for (const observation of observations) {
    if (observation.observedAt < actionDate) {
      before.add(observation.domain);
    }
  }

  const after = observations
    .filter((observation) => observation.observedAt >= actionDate)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  for (const observation of after) {
    if (!before.has(observation.domain)) {
      const days = Math.floor(
        (observation.observedAt.getTime() - actionDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      return { domain: observation.domain, observedAt: observation.observedAt, daysAfterAction: days };
    }
  }

  return null;
}

export interface VisibilityChangeFinding {
  fromPct: number;
  toPct: number;
  deltaPp: number;
}

/**
 * Изменение видимости относительно baseline, если оно превысило порог.
 *
 * Порог нужен, чтобы шум недельных колебаний не превращался в «событие»:
 * таймлайн, где каждую неделю что-то «произошло», перестаёт читаться.
 */
export function findVisibilityChange(
  baselinePct: number | null,
  latestPct: number | null,
  thresholdPp = VISIBILITY_CHANGE_THRESHOLD_PP,
): VisibilityChangeFinding | null {
  if (baselinePct === null || latestPct === null) {
    return null;
  }

  const deltaPp = Math.round((latestPct - baselinePct) * 10) / 10;
  if (Math.abs(deltaPp) < thresholdPp) {
    return null;
  }

  return { fromPct: baselinePct, toPct: latestPct, deltaPp };
}
