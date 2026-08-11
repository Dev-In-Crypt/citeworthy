/**
 * Baseline эксперимента: как клиент выглядел ДО действия.
 *
 * Считается по тем же недельным срезам, что и обычная видимость (контракт C3).
 * Ключевое ограничение, которое нельзя прятать: у клиента один сайт и один
 * бренд, поэтому настоящей контрольной группы не существует. Кластеры, которых
 * действие не касалось, — это квази-контроль, и его слабость должна попадать
 * в confidence, а не замалчиваться.
 */

/** Окно baseline по умолчанию: 28 дней до действия — четыре недельных среза. */
export const BASELINE_WINDOW_DAYS = 28;

/** Минимум срезов, ниже которого baseline не считается измерением. */
export const MIN_BASELINE_SNAPSHOTS = 2;

export interface SnapshotPoint {
  clusterId: string | null;
  periodStart: Date;
  clientVisibilityPct: number;
  sampleCount: number;
}

export interface BaselineWindow {
  start: Date;
  end: Date;
}

/** Окно [actionDate - N дней, actionDate). */
export function baselineWindow(actionDate: Date, days = BASELINE_WINDOW_DAYS): BaselineWindow {
  return {
    start: new Date(actionDate.getTime() - days * 24 * 60 * 60 * 1000),
    end: actionDate,
  };
}

export interface GroupBaseline {
  /** Средняя видимость по срезам окна, взвешенная числом ответов. */
  visibilityPct: number | null;
  snapshots: number;
  samples: number;
  sufficient: boolean;
}

/**
 * Средняя видимость группы кластеров за окно.
 *
 * Взвешивание по числу ответов, а не простое среднее: неделя с тремя ответами
 * не должна весить столько же, сколько неделя с сотней — иначе редкий шумный
 * срез перетянет baseline на себя.
 */
export function averageVisibility(
  snapshots: SnapshotPoint[],
  clusterIds: string[],
  window: BaselineWindow,
): GroupBaseline {
  const relevant = snapshots.filter(
    (point) =>
      point.clusterId !== null &&
      clusterIds.includes(point.clusterId) &&
      point.periodStart >= window.start &&
      point.periodStart < window.end,
  );

  if (relevant.length === 0) {
    return { visibilityPct: null, snapshots: 0, samples: 0, sufficient: false };
  }

  const samples = relevant.reduce((sum, point) => sum + point.sampleCount, 0);
  if (samples === 0) {
    return { visibilityPct: null, snapshots: relevant.length, samples: 0, sufficient: false };
  }

  const weighted = relevant.reduce(
    (sum, point) => sum + point.clientVisibilityPct * point.sampleCount,
    0,
  );

  return {
    visibilityPct: Math.round((weighted / samples) * 10) / 10,
    snapshots: relevant.length,
    samples,
    sufficient: relevant.length >= MIN_BASELINE_SNAPSHOTS,
  };
}

export interface ExperimentPlan {
  actionDate: Date;
  window: BaselineWindow;
  treatmentClusterIds: string[];
  controlClusterIds: string[];
  treatment: GroupBaseline;
  control: GroupBaseline;
  /** Предупреждения, которые обязаны дойти до интерфейса, а не остаться в коде. */
  warnings: string[];
}

export const EXPERIMENT_WARNINGS = {
  noControl:
    "No untouched clusters to compare against. Movement cannot be separated from platform-wide drift.",
  thinBaseline:
    "Fewer baseline weeks than the minimum. The 'before' side of the comparison is weak.",
  noBaseline: "No measurements before the action date. There is nothing to compare against.",
} as const;

/** Готовит эксперимент: окно, группы и честный список слабых мест. */
export function planExperiment(
  actionDate: Date,
  allClusterIds: string[],
  treatmentClusterIds: string[],
  snapshots: SnapshotPoint[],
  days = BASELINE_WINDOW_DAYS,
): ExperimentPlan {
  const window = baselineWindow(actionDate, days);
  const controlClusterIds = allClusterIds.filter((id) => !treatmentClusterIds.includes(id));

  const treatment = averageVisibility(snapshots, treatmentClusterIds, window);
  const control = averageVisibility(snapshots, controlClusterIds, window);

  const warnings: string[] = [];
  if (controlClusterIds.length === 0) {
    warnings.push(EXPERIMENT_WARNINGS.noControl);
  }
  if (treatment.visibilityPct === null) {
    warnings.push(EXPERIMENT_WARNINGS.noBaseline);
  } else if (!treatment.sufficient) {
    warnings.push(EXPERIMENT_WARNINGS.thinBaseline);
  }

  return {
    actionDate,
    window,
    treatmentClusterIds,
    controlClusterIds,
    treatment,
    control,
    warnings,
  };
}
