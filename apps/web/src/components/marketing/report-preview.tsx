import type { ReportPayload } from "@repo/core";
import { AgencyCard } from "./agency-card";
import { AGENCIES } from "./data";

/**
 * Сокращённый отчёт клиента в бренде агентства — для витрины.
 *
 * Собирается из того же `ReportPayload`, что печатает продукт, и повторяет
 * порядок и подписи `ReportView` (components/report-view.tsx). Ничего, чего
 * нет в настоящем отчёте, здесь быть не может: ни графика, ни значка
 * уверенности у видимости, ни причин под «Next sprint», ни долей каждого
 * конкурента. Разрешено только сокращать — и карточка говорит, что сокращена.
 *
 * Сам `ReportView` сюда не вставить: он держит бренд в `--primary` на своём
 * корне, а переключатель агентств меняет `--agency` на карточке.
 */

/** Как в ReportView: знак плюс, минус — обычным дефисом. */
function formatPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${value} pp`;
}

/**
 * Домены в причинах примера аудита — на `.example`, как во всей витрине:
 * приписывать выдуманные доли реальным площадкам на публичной странице незачем.
 */
const EXAMPLE_DOMAINS: [RegExp, string][] = [
  [/g2\.com/g, "reviewhub.example"],
  [/reddit\.com/g, "forum.example"],
  [/capterra\.com/g, "listings.example"],
];

function exampleDomains(text: string): string {
  return EXAMPLE_DOMAINS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

function DeliveryBody({ payload }: { payload: ReportPayload }) {
  const work = payload.workCompleted;
  const shownWork = work.slice(0, 3);
  const up = payload.results.visibilityDeltaPp >= 0;

  return (
    <>
      <div className="r-title">AI answer visibility</div>
      <p className="r-sum">
        Across the tracked buyer questions, {payload.client.name} was named in an estimated{" "}
        {payload.visibility.after}% of answers this period, {up ? "up" : "down"} from{" "}
        {payload.visibility.before}%. The gap to the strongest tracked competitor stands at{" "}
        {formatPp(payload.competitorGap.after)}. Every figure is an estimate from repeated samples of
        assistant answers, not a count of real buyer conversations.
      </p>
      <div className="r-stats">
        <div>
          <span>Named in answers</span>
          <b>
            {payload.visibility.before}% → {payload.visibility.after}%
          </b>
          <span>{formatPp(payload.results.visibilityDeltaPp)} over the period</span>
        </div>
        <div>
          <span>Competitor gap</span>
          <b className="sm">
            {formatPp(payload.competitorGap.before)} → {formatPp(payload.competitorGap.after)}
          </b>
          <span>Against the best-performing tracked competitor</span>
        </div>
      </div>
      <div className="r-sec">
        <h5>Work completed</h5>
        <ul className="r-rows">
          {shownWork.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <b>{item.count}</b>
            </li>
          ))}
          {work.length > shownWork.length && (
            <li className="more-rows">+ {work.length - shownWork.length} more lines</li>
          )}
        </ul>
      </div>
      <div className="r-sec">
        <h5>Results</h5>
        <ul className="r-rows">
          <li>
            <span>Newly cited sources</span>
            <b>{payload.results.newCitedUrls}</b>
          </li>
          <li>
            <span>Brand mentions in AI answers</span>
            <b>{payload.results.newBrandMentions}</b>
          </li>
        </ul>
      </div>
      {payload.nextSprint.length > 0 && (
        <div className="r-sec">
          <h5>Next sprint</h5>
          <ol className="r-next">
            {payload.nextSprint.map((item) => (
              <li key={item}>
                <div>{item}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function AuditBody({ payload }: { payload: ReportPayload }) {
  const opportunity = payload.opportunity;
  if (!opportunity) return null;
  const shown = opportunity.rankedActions.slice(0, 3);

  return (
    <>
      <div className="r-title">AI answer visibility</div>
      <div className="r-sec">
        <h5>Where the opportunity is</h5>
      </div>
      <div className="r-stats">
        <div>
          <span>Visibility today</span>
          <b>{opportunity.currentVisibilityPct}%</b>
          <span>Share of answers mentioning the brand</span>
        </div>
        <div>
          <span>Tracked competitors, average</span>
          <b>{opportunity.competitorAverageVisibilityPct}%</b>
          <span>{formatPp(opportunity.gapPp)} versus the average</span>
        </div>
      </div>
      <div className="r-sec">
        <h5>
          Ranked work for the next {opportunity.scopeDays} days · {shown.length} of{" "}
          {opportunity.rankedActions.length}
        </h5>
        <ol className="r-next">
          {shown.map((action) => (
            <li key={action.title}>
              <div>
                {exampleDomains(action.title)}
                <span>{exampleDomains(action.reason)}</span>
                <span className="r-meta-line">
                  Estimated impact: {action.estimatedImpact} · Effort: {action.effort}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="prop">
        <div>
          <span>Proposed engagement</span>
          <br />
          <b>${opportunity.suggestedRetainerUsd.toLocaleString("en-US")} / month</b>
        </div>
        <span>
          Estimated effort: {opportunity.estimatedEffortHours.min}–{opportunity.estimatedEffortHours.max} h
          per month
        </span>
      </div>
    </>
  );
}

export function ReportPreview({
  payload,
  variant,
  testId,
  ariaLabel,
  initial = 0,
  hint,
  approve = false,
}: {
  payload: ReportPayload;
  variant: "delivery" | "audit";
  testId: string;
  ariaLabel: string;
  initial?: number;
  hint?: string;
  /** Полоса подтверждения — она стоит под отчётом на странице по ссылке, не в PDF. */
  approve?: boolean;
}) {
  return (
    <AgencyCard
      agencies={AGENCIES}
      initial={initial}
      hint={hint}
      ariaLabel={ariaLabel}
      testId={testId}
      meta={
        <>
          {payload.client.name}
          <br />
          {payload.period.start} — {payload.period.end}
        </>
      }
    >
      {variant === "delivery" ? <DeliveryBody payload={payload} /> : <AuditBody payload={payload} />}
      <div className="r-sec">
        <h5>How to read this</h5>
        <ul className="r-caveats">
          {payload.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </div>
      {approve && (
        <div className="r-approve" aria-hidden>
          <span className="lab">Approve this report</span>
          <span className="field">Your name</span>
          <span className="approve">Approve</span>
        </div>
      )}
      <div className="r-foot">
        <span className="label">Abridged preview · example data</span>
      </div>
    </AgencyCard>
  );
}
