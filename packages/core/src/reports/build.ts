import { measurementBasisFor } from "../copy";
import { competitorGapPp } from "../metrics/visibility";
import type { VisibilitySnapshot } from "../metrics/visibility";
import { reportPayloadSchema } from "./schema";
import type { ReportPayload } from "./schema";

/**
 * Сборка клиентского отчёта из уже посчитанных данных.
 *
 * Чистая функция: отчёт уходит конечному клиенту, и он должен воспроизводиться
 * из тех же цифр, что показаны агентству в интерфейсе. Никаких отдельных
 * расчётов «для отчёта» — иначе две цифры разойдутся, и объяснять это придётся
 * агентству перед его клиентом.
 */

export interface ReportInputs {
  clientName: string;
  periodStart: Date;
  periodEnd: Date;
  /** Свёрнутые срезы (все кластеры, все платформы), отсортированные по времени. */
  snapshots: VisibilitySnapshot[];
  completedActions: { title: string; actionType: string }[];
  newCitedUrls: number;
  newBrandMentions: number;
  highestImpact: {
    title: string;
    incrementalPp: number | null;
    confidence: "low" | "medium" | "high";
  } | null;
  nextSprint: string[];
  /** Слабые места, которые нельзя прятать от клиента. */
  caveats: string[];
  /**
   * Движение по отдельным вопросам. Вопросы, где выборки не хватило на
   * сравнение, вызывающий не передаёт вовсе — в отчёте они не должны
   * выглядеть как «не изменилось».
   */
  movement?: { prompt: string; deltaPp: number; sharePct: number }[];
  /**
   * Платформы, по которым реально есть измерения. От них зависит формулировка
   * оговорки: отчёт по одной платформе не вправе говорить «several platforms».
   */
  measuredPlatforms?: readonly string[];
  /** Раздел бесплатного аудита; у платящего клиента его нет. */
  opportunity?: NonNullable<ReportPayload["opportunity"]> | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Человекочитаемые названия типов работ для раздела «что сделано». */
const WORK_LABELS: Record<string, string> = {
  refresh_page: "Pages refreshed",
  create_page: "New pages published",
  technical_fix: "Technical fixes",
  structured_data_fix: "Structured data fixes",
  crawler_fix: "Crawlability fixes",
  source_outreach: "Source outreach",
  review_platform: "Review platform work",
  pr_editorial: "Editorial outreach",
  ugc_community: "Community work",
  product_data_update: "Product data updates",
};

export function summariseWork(
  actions: { actionType: string }[],
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const action of actions) {
    const label = WORK_LABELS[action.actionType] ?? "Other work";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Диапазон вместо точки: единственная честная форма для оценки, которую
 * нельзя проверить. ±30% вокруг оценки — признание, что точность неизвестна.
 */
export function formatContributionRange(incrementalPp: number | null): string | null {
  if (incrementalPp === null) return null;

  const magnitude = Math.abs(incrementalPp);
  const low = Math.max(0, Math.floor(magnitude * 0.7));
  const high = Math.ceil(magnitude * 1.3);
  const sign = incrementalPp >= 0 ? "+" : "−";

  return low === high ? `${sign}${high} pp` : `${sign}${low}–${high} pp`;
}

/** Собирает и валидирует payload. Невалидный отчёт наружу не уходит. */
export function buildReportPayload(inputs: ReportInputs): ReportPayload {
  const first = inputs.snapshots.at(0) ?? null;
  const last = inputs.snapshots.at(-1) ?? null;

  const visibilityBefore = first ? first.clientVisibilityPct : 0;
  const visibilityAfter = last ? last.clientVisibilityPct : 0;

  const payload: ReportPayload = {
    client: { name: inputs.clientName },
    period: {
      start: inputs.periodStart.toISOString().slice(0, 10),
      end: inputs.periodEnd.toISOString().slice(0, 10),
    },
    visibility: { before: visibilityBefore, after: visibilityAfter },
    competitorGap: {
      before: first ? competitorGapPp(first) : 0,
      after: last ? competitorGapPp(last) : 0,
    },
    workCompleted: summariseWork(inputs.completedActions),
    results: {
      newCitedUrls: inputs.newCitedUrls,
      newBrandMentions: inputs.newBrandMentions,
      visibilityDeltaPp: round1(visibilityAfter - visibilityBefore),
    },
    highestImpactAction: null,
    nextSprint: inputs.nextSprint,
    // Пустой список не кладём: раздел «что изменилось» без строк выглядел бы
    // как «ничего не изменилось», а это другое утверждение.
    ...(inputs.movement && inputs.movement.length > 0 ? { movement: inputs.movement } : {}),
    opportunity: inputs.opportunity ?? null,
    // Пояснение о природе измерения идёт в каждом отчёте, а не по желанию,
    // и описывает то, что измерялось на самом деле.
    caveats: [measurementBasisFor(inputs.measuredPlatforms ?? []), ...inputs.caveats],
  };

  const contribution = inputs.highestImpact
    ? formatContributionRange(inputs.highestImpact.incrementalPp)
    : null;

  if (inputs.highestImpact && contribution) {
    payload.highestImpactAction = {
      title: inputs.highestImpact.title,
      estimatedContribution: contribution,
      confidence: inputs.highestImpact.confidence,
    };
  }

  return reportPayloadSchema.parse(payload);
}
