import type { Metadata } from "next";
import Link from "next/link";
import {
  DIAGNOSIS_COPY,
  MARKETING_COPY,
  MEASUREMENT_COPY,
  OPPORTUNITY_COPY,
  REPORT_COPY,
  SAMPLE_DELIVERY_REPORT,
  SAMPLE_HIGHLIGHTS,
  delta,
  estimateExperiment,
  formatContributionRange,
} from "@repo/core";
import { AgencyCard } from "@/components/marketing/agency-card";
import { Conf, LegendLine, SecHead, SrcChip } from "@/components/marketing/bits";
import { MarketingShell } from "@/components/marketing/chrome";
import { ExperimentChart, PromptMatrix, SourceFlow } from "@/components/marketing/charts";
import { AGENCIES, CLIENT, EXPERIMENT, periodMean } from "@/components/marketing/data";

/**
 * Страница продукта: шесть частей по порядку работы с клиентом.
 *
 * Все графики — пример на выдуманных данных и так подписаны. Цифры отчёта в
 * карточке — из собранного примера отчёта, вместе с его оговоркой: в том
 * квартале нетронутых тем не было, и вклад действия не отделён от общего
 * дрейфа платформ. Раздел экспериментов показывает сам метод — сравнение с
 * нетронутыми темами — на отдельном, тоже выдуманном примере.
 */

export const metadata: Metadata = {
  title: "Product · Citeworthy",
  description:
    "Measure, diagnose, act, run experiments and report: how Citeworthy turns sampled AI answers into agency work and white-label reports.",
};

const H = SAMPLE_HIGHLIGHTS;
const HIGHEST = SAMPLE_DELIVERY_REPORT.highestImpactAction;

/* Пример эксперимента считается той же математикой, что и в продукте (контракт C5). */
const treatedBefore = periodMean(EXPERIMENT.treated, EXPERIMENT.before);
const treatedAfter = periodMean(EXPERIMENT.treated, EXPERIMENT.after);
const untouchedBefore = periodMean(EXPERIMENT.untouched, EXPERIMENT.before);
const untouchedAfter = periodMean(EXPERIMENT.untouched, EXPERIMENT.after);
const estimate = estimateExperiment({
  treatmentBefore: treatedBefore,
  treatmentAfter: treatedAfter,
  controlBefore: untouchedBefore,
  controlAfter: untouchedAfter,
  treatmentSamplesAfter: 4 * 9 * 9,
  baselineSnapshots: EXPERIMENT.before[1] - EXPERIMENT.before[0],
  hasControlGroup: true,
  hasNewCitation: false,
});
const effectRange = formatContributionRange(estimate.incrementalPp) ?? "";

/** Концы диапазона для полосы на оси: «+2–6 pp» → [2, 6]. */
function rangeEnds(range: string): [number, number] {
  const numbers = range.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0];
  const sign = range.startsWith("−") ? -1 : 1;
  const [a = 0, b = a] = numbers;
  return [sign * a, sign * b].sort((x, y) => x - y) as [number, number];
}
const AXIS = { min: -2, max: 10 };
const toPct = (v: number) => ((v - AXIS.min) / (AXIS.max - AXIS.min)) * 100;
const [effectLo, effectHi] = rangeEnds(effectRange);

const fmt1 = (v: number) => v.toFixed(1);
const fmtDelta = (v: number | null) =>
  v === null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

const actionsCompleted = SAMPLE_HIGHLIGHTS.deliveryWork.reduce((sum, item) => sum + item.count, 0);

const FACTORS = [
  { label: OPPORTUNITY_COPY.factorLabels.impact, width: 82, value: "large" },
  { label: OPPORTUNITY_COPY.factorLabels.coverage, width: 38, value: "38%" },
  { label: OPPORTUNITY_COPY.factorLabels.commercialIntent, width: 75, value: "high" },
  { label: OPPORTUNITY_COPY.factorLabels.actionability, width: 50, value: "partly" },
  { label: OPPORTUNITY_COPY.factorLabels.confidence, width: 70, value: "medium" },
];

const OPPORTUNITIES = [
  {
    title: `Get ${CLIENT} covered on forum.example`,
    reason: `forum.example is cited in 12% of answers here (9 citations), and threads comparing the category name competitors without mentioning ${CLIENT}.`,
    impact: "medium",
    effort: "medium",
  },
  {
    title: "Publish a page that answers the comparison questions directly",
    reason: "no page from fernpost.example appears among the 9 sources cited for the comparison cluster, so there is nothing of the client's own to cite.",
    impact: "medium",
    effort: "medium",
  },
  {
    title: "Refresh the fernpost.example pricing page",
    reason: "the page is cited 6 times here, but the brand is not mentioned in those answers. It is being read without carrying the name.",
    impact: "medium",
    effort: "low",
  },
  {
    title: `Get ${CLIENT} covered on listings.example`,
    reason: "listings.example is cited in 7% of answers here (5 citations), with two competitors listed and the client absent.",
    impact: "medium",
    effort: "low",
  },
];

const ENDPOINTS = [
  { path: "/api/v1/clients", what: "Clients of your agency" },
  { path: "/api/v1/clients/{id}/visibility", what: "Prompt × assistant matrix, intervals, movement" },
  { path: "/api/v1/clients/{id}/sources", what: "Cited sources and presence" },
  { path: "/api/v1/clients/{id}/opportunities", what: "Ranked opportunities with reasons" },
  { path: "/api/v1/clients/{id}/actions", what: "Work queue with reasons" },
  { path: "/api/v1/reports", what: "Reports and their status" },
];

export default function ProductPage() {
  return (
    <MarketingShell active="product">
      <div className="wrap">
        <section className="p-hero">
          <div>
            <div className="kicker page-kicker">Product</div>
            <h1 className="display">
              From the answers assistants give <em>to the report your client reads.</em>
            </h1>
            <p className="lead">
              Six parts, one per client: measure the answers, find the sources behind them, rank the
              work, check what followed it, report it in your brand, and pull any of it into your own
              tools.
            </p>
            <nav className="jump" aria-label="On this page">
              <a href="#measure"><i>1</i>Measure</a>
              <a href="#diagnose"><i>2</i>Diagnose</a>
              <a href="#act"><i>3</i>Opportunities</a>
              <a href="#experiments"><i>4</i>Experiments</a>
              <a href="#reports"><i>5</i>Reports</a>
              <a href="#api"><i>6</i>API</a>
            </nav>
          </div>
          <aside className="card method" aria-label="Measurement method">
            <div className="cap">How every figure is made</div>
            <dl>
              <div><dt>Samples per prompt, per assistant</dt><dd>≥ 3</dd></div>
              <div><dt>Aggregation window</dt><dd>weekly</dd></div>
              <div><dt>Raw answer stored</dt><dd>every one</dd></div>
              <div><dt>Model version recorded</dt><dd>per answer</dd></div>
              <div><dt>Figures from a single answer</dt><dd>none</dd></div>
            </dl>
            <div className="basis">{MARKETING_COPY.methodNote}</div>
          </aside>
        </section>
      </div>

      {/* 1 · измерение */}
      <section className="sec" id="measure">
        <div className="wrap">
          <SecHead n={1} title="Measure: every prompt, every assistant, every week">
            You write the questions your client&apos;s buyers ask, or generate them and edit the
            list. Each one is asked on every assistant you switch on, at least three times a week,
            and each cell is an aggregate of those samples.
          </SecHead>
          <div className="card">
            <div className="panel-head">
              <span className="t">
                Prompt × assistant <span>· {CLIENT} · W26 · example data</span>
              </span>
              <Conf level="medium" />
            </div>
            <div className="panel-body">
              <PromptMatrix />
            </div>
            <div className="panel-foot">
              <div className="mx-legend">
                <span>
                  <i className="sw" style={{ background: "linear-gradient(90deg,rgb(0 166 62/.08),rgb(0 166 62/.56))" }} />
                  share of answers naming {CLIENT}
                </span>
                <span>
                  <i className="sw" style={{ background: "#FFF1E7", border: "1px dashed #F54900" }} />
                  a competitor named, {CLIENT} not
                </span>
                <span>
                  <i className="sw" style={{ background: "#fff", border: "1px solid #E3E1DA" }} />
                  under the sample floor
                </span>
                <span>
                  <i
                    className="sw"
                    style={{ background: "repeating-linear-gradient(135deg,#F1EFE9 0 3px,#E3E1DA 3px 4px)" }}
                  />
                  not measured
                </span>
              </div>
              <div className="label">
                {MEASUREMENT_COPY.matrixBasis} “Not measured” means we do not ask that assistant, so
                there is nothing to report either way.
              </div>
              <div className="label only-sm">Scroll the table sideways to see all five assistants →</div>
            </div>
          </div>
          <div className="facts">
            <div className="card fact">
              <b>3 + 2</b>
              <span>ChatGPT, Perplexity and Gemini by default; Claude and Grok per client.</span>
            </div>
            <div className="card fact">
              <b>≥ 3</b>
              <span>samples per prompt per assistant before a cell shows a number.</span>
            </div>
            <div className="card fact">
              <b>Weekly</b>
              <span>windows. Earlier weeks stay as they were measured.</span>
            </div>
            <div className="card fact">
              <b>Stored</b>
              <span>every raw answer, so a parser improvement can be replayed over history.</span>
            </div>
          </div>
          <p className="label" style={{ marginTop: 14 }}>
            {MARKETING_COPY.notMeasuredSurfaces}
          </p>
        </div>
      </section>

      {/* 2 · диагностика */}
      <section className="sec" id="diagnose">
        <div className="wrap">
          <SecHead n={2} title="Diagnose: which sources decide the answer">
            Every answer comes with the pages it cited. Grouped by kind of source, they show where
            competitors are named and your client is not, which tells you whether the gap is on the
            client&apos;s own site or out in the category.
          </SecHead>
          <div className="split rev">
            <div className="card">
              <div className="panel-head">
                <span className="t">
                  Cited sources → brands named in the same answer <span>· W26 · example data</span>
                </span>
                <Conf level="medium" estimated={false} />
              </div>
              <div className="panel-body">
                <SourceFlow />
              </div>
              <div className="panel-foot label">
                Each band: citations of that kind of source in answers naming that brand. One answer
                can cite several sources and name several brands.
              </div>
            </div>
            <div className="card verdict">
              <div className="kicker">Diagnosis · {CLIENT}</div>
              <p className="h3">{DIAGNOSIS_COPY.thirdPartyGap}</p>
              <div className="share-row">
                <span>Competitor mentions from answers citing third-party sources</span>
                <b>78%</b>
                <span className="bar">
                  <i style={{ width: "78%", background: "#F54900", opacity: 0.8 }} />
                </span>
              </div>
              <div className="share-row">
                <span>{CLIENT} mentions from answers citing its own pages</span>
                <b>49%</b>
                <span className="bar">
                  <i style={{ width: "49%", background: "#00A63E" }} />
                </span>
              </div>
              <div className="cites">
                <SrcChip n={1} domain="reviewhub.example" kind="gap" note="gap" />
                <SrcChip n={2} domain="forum.example" kind="gap" note="gap" />
                <SrcChip n={3} domain="toolreview.example" kind="has" note="names both" />
              </div>
              <div className="basis" style={{ marginTop: "auto" }}>
                {DIAGNOSIS_COPY.evidenceNote} {DIAGNOSIS_COPY.presenceCaveat}
              </div>
            </div>
          </div>
          <div className="tape">
            <div className="tape-head">
              <span className="kicker">Evidence · answers citing reviewhub.example</span>
              <span className="label">examples from the sample, shown after the aggregate</span>
            </div>
            <div className="tape-item">
              <div className="src"><span>Perplexity · sample 1/3</span><span>23 Jun</span></div>
              <q>
                Most reviewers recommend <span className="nm-comp">Quillstack</span>, with{" "}
                <span className="nm-comp">Loambox</span> as a cheaper option …
              </q>
              <div className="cites"><SrcChip n={1} domain="reviewhub.example" kind="gap" note="gap" /></div>
            </div>
            <div className="tape-item">
              <div className="src"><span>ChatGPT · sample 2/3</span><span>24 Jun</span></div>
              <q>
                Reviewers rate <span className="nm-comp">Quillstack</span> highest for larger teams;{" "}
                <span className="nm-comp">Tidepin</span> suits freelancers …
              </q>
              <div className="cites">
                <SrcChip n={2} domain="reviewhub.example" kind="gap" note="gap" />
                <SrcChip n={3} domain="tidepin.example" kind="plain" />
              </div>
            </div>
            <div className="tape-item">
              <div className="src"><span>Gemini · sample 3/3</span><span>25 Jun</span></div>
              <q>
                On review sites, <span className="nm-comp">Loambox</span> and{" "}
                <span className="nm-comp">Quillstack</span> collect the most studio reviews …
              </q>
              <div className="cites"><SrcChip n={1} domain="reviewhub.example" kind="gap" note="gap" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 · возможности и работа */}
      <section className="sec" id="act">
        <div className="wrap">
          <SecHead n={3} title="Opportunities: ranked work, each with a reason">
            {OPPORTUNITY_COPY.basis} No item exists without a reason.
          </SecHead>
          <div className="split rev">
            <div className="card">
              <div className="panel-head">
                <span className="t">
                  Opportunities <span>· {CLIENT} · window W24–W26 · example data</span>
                </span>
                <span className="label">5 of 11</span>
              </div>
              <ol className="opps">
                <li>
                  <span className="rk">1</span>
                  <div>
                    <h4>Get {CLIENT} covered on reviewhub.example</h4>
                    <p className="why">
                      <b>Reason:</b> reviewhub.example is cited in 18% of answers for this category
                      (14 citations). Quillstack and Loambox appear in those answers; {CLIENT} does
                      not.
                    </p>
                    <div className="tags">
                      <span className="tag">estimated impact: high</span>
                      <span className="tag">effort: medium</span>
                      <span className="tag">type: review platform</span>
                    </div>
                    <div className="factors" aria-label="Why it ranks first">
                      {FACTORS.map((f) => (
                        <div key={f.label}>
                          <span>{f.label}</span>
                          <span className="bar">
                            <i style={{ width: `${f.width}%`, background: "#3C414B" }} />
                          </span>
                          <span>{f.value}</span>
                        </div>
                      ))}
                      <span className="label">{OPPORTUNITY_COPY.coverageBasis}</span>
                    </div>
                  </div>
                </li>
                {OPPORTUNITIES.map((o, i) => (
                  <li key={o.title}>
                    <span className="rk">{i + 2}</span>
                    <div>
                      <h4>{o.title}</h4>
                      <p className="why">
                        <b>Reason:</b> {o.reason}
                      </p>
                      <div className="tags">
                        <span className="tag">estimated impact: {o.impact}</span>
                        <span className="tag">effort: {o.effort}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="side">
              <div className="card pad">
                <div className="cap" style={{ marginBottom: 12 }}>
                  Actions board · this sprint
                </div>
                <div className="board">
                  <div className="bcol">
                    <h3>Planned <span>2</span></h3>
                    <div className="tks">
                      <div className="tk">
                        <b>Review listing</b>
                        <span>Reason: reviewhub.example cited in 18% of answers</span>
                        <div className="who"><i>AK</i>due 10 Jul</div>
                      </div>
                      <div className="tk">
                        <b>Comparison page</b>
                        <span>Reason: no own page among 9 cited sources</span>
                        <div className="who"><i>MR</i>due 17 Jul</div>
                      </div>
                    </div>
                  </div>
                  <div className="bcol">
                    <h3>In progress <span>1</span></h3>
                    <div className="tks">
                      <div className="tk">
                        <b>Pricing page refresh</b>
                        <span>Reason: cited 6 times, name not carried</span>
                        <div className="who"><i>JS</i>since 1 Jul</div>
                      </div>
                    </div>
                  </div>
                  <div className="bcol">
                    <h3>Done <span>3</span></h3>
                    <div className="tks">
                      <div className="tk">
                        <b>Migration guide</b>
                        <span>Reason: 3 answers send migrations to a competitor</span>
                        <div className="who"><i>AK</i>2 Jul</div>
                      </div>
                      <span className="more">+ 2 more</span>
                    </div>
                  </div>
                </div>
                <div className="ctrl">
                  <b>Control topics · untouched:</b> invoicing, time tracking. Marked before the
                  sprint started, so later movement has something to be compared with.
                </div>
              </div>
              <ul className="rules" style={{ marginTop: 22 }}>
                <li>
                  <span>
                    <b>Dismissing needs a reason too</b>, so the next person does not re-open it.{" "}
                    {OPPORTUNITY_COPY.dismissReturns}
                  </span>
                </li>
                <li>
                  <span>
                    <b>“{OPPORTUNITY_COPY.snoozeLabel}”</b>: {OPPORTUNITY_COPY.snoozeNote}
                  </span>
                </li>
                <li>
                  <span>
                    <b>Nothing is published for you.</b> The board records work your team does; any
                    change to a client&apos;s site stays a human decision.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · эксперименты */}
      <section className="sec" id="experiments">
        <div className="wrap">
          <SecHead n={4} title="Experiments: what followed the work, with an interval">
            {MARKETING_COPY.experimentMethod}
          </SecHead>
          <div className="card exp" data-testid="experiment-example">
            <div className="exp-chart">
              <div className="ev-title">
                Migration guide refresh <span>· {CLIENT} · next sprint · example data</span>
              </div>
              <div className="legend">
                <span>
                  <LegendLine kind="client" />
                  Topics the guide covers
                </span>
                <span>
                  <LegendLine kind="control" />
                  Untouched topics: invoicing, time tracking
                </span>
              </div>
              <ExperimentChart
                actionLabel="Migration guide refreshed · 2 Jul"
                actionLabelShort="Guide refreshed · W27"
              />
              <div className="basis">
                Before: W22–W26 · after: W30–W33 · W27–W29 left out while models re-crawl · 3
                assistants × 3 samples per prompt
              </div>
            </div>
            <div className="exp-side">
              <div>
                <div className="cap">Estimated incremental effect</div>
                <div className="big-range">
                  {effectRange.replace(/\s*pp$/, "")}
                  <small> pp</small>
                </div>
                <div
                  className="range"
                  role="img"
                  aria-label={`Range from ${effectLo} to ${effectHi} points on an axis from ${AXIS.min} to ${AXIS.max}`}
                >
                  <div className="axis" />
                  <div className="zero" style={{ left: `${toPct(0)}%` }} />
                  <div
                    className="span"
                    style={{ left: `${toPct(effectLo)}%`, width: `${toPct(effectHi) - toPct(effectLo)}%` }}
                  />
                  <span className="tk2 start" style={{ left: 0 }}>−2</span>
                  <span className="tk2" style={{ left: `${toPct(0)}%` }}>0</span>
                  <span className="tk2" style={{ left: `${toPct(4)}%` }}>+4</span>
                  <span className="tk2 end" style={{ left: "100%" }}>+10</span>
                </div>
              </div>
              <Conf level={estimate.confidence} />
              <table className="ba">
                <thead>
                  <tr><th>Topics</th><th>Before</th><th>After</th><th>Change</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Covered by the guide</td>
                    <td>{fmt1(treatedBefore)}%</td>
                    <td>{fmt1(treatedAfter)}%</td>
                    <td>{fmtDelta(delta(treatedBefore, treatedAfter))}</td>
                  </tr>
                  <tr>
                    <td>Untouched</td>
                    <td>{fmt1(untouchedBefore)}%</td>
                    <td>{fmt1(untouchedAfter)}%</td>
                    <td>{fmtDelta(delta(untouchedBefore, untouchedAfter))}</td>
                  </tr>
                  <tr>
                    <td>Difference</td>
                    <td />
                    <td />
                    <td>{fmtDelta(estimate.incrementalPp)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="small">{MARKETING_COPY.experimentRecord}</p>
              <p className="label">{MARKETING_COPY.experimentWithoutControl}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5 · отчёты */}
      <section className="sec" id="reports">
        <div className="wrap">
          <SecHead n={5} title="White-label reports, in your name only">
            A report is a link the client opens without an account, and a PDF of the same page. Your
            logo and colour are on it; the product is not named anywhere.
          </SecHead>
          <div className="split">
            <div className="side">
              <h3 className="h3">What the client can do</h3>
              <ul className="never">
                <li>Open the report from a link, with no account and no login</li>
                <li>Download the same page as a PDF</li>
                <li>Approve the next sprint from the page</li>
              </ul>
              <h3 className="h3" style={{ marginTop: 32 }}>
                What never appears
              </h3>
              <ul className="never x">
                <li>Our name, logo, favicon or colour</li>
                <li>“Powered by” or any link back to us</li>
                <li>Pricing, plan names or upsell messages</li>
              </ul>
              <p className="label" style={{ marginTop: 16 }}>
                What always stays: “estimated”, the confidence level, the sample basis and a reason
                under every recommended action.
              </p>
            </div>
            <div className="wl-stage">
              <AgencyCard
                agencies={AGENCIES}
                initial={1}
                ariaLabel="Example white-label quarterly report"
                testId="product-report"
                meta={
                  <>
                    Prepared for {CLIENT}
                    <br />1 Apr – 30 Jun 2026
                  </>
                }
              >
                <div className="r-title">Quarterly report: what moved, what was done</div>
                <div className="r-stats">
                  <div>
                    <b>
                      {H.deliveryBefore} → {H.deliveryAfter}%
                    </b>
                    <span>share of answers naming {CLIENT} · ▲ {H.deliveryDeltaPp} pp</span>
                  </div>
                  <div>
                    <b>{actionsCompleted}</b>
                    <span>actions completed · {H.deliveryNewCitedUrls} newly cited URLs</span>
                  </div>
                </div>
                {HIGHEST && (
                  <div className="hl">
                    <span>Highest-impact action</span>
                    <b>{HIGHEST.title}</b>
                    <span>
                      Estimated contribution: {HIGHEST.estimatedContribution} · Confidence:{" "}
                      {HIGHEST.confidence}
                    </span>
                  </div>
                )}
                <div className="r-sec">
                  <h5>Next sprint</h5>
                  <ol className="r-next">
                    <li>
                      <div>
                        {SAMPLE_DELIVERY_REPORT.nextSprint[0]}
                        <span>Reason: cited in answers that name Quillstack and Loambox, not {CLIENT}.</span>
                      </div>
                    </li>
                    <li>
                      <div>
                        {SAMPLE_DELIVERY_REPORT.nextSprint[2]}
                        <span>Reason: integration questions cite a page that lists retired partners.</span>
                      </div>
                    </li>
                  </ol>
                </div>
                <div className="r-caveat">{REPORT_COPY.noComparisonGroup}</div>
                <div className="r-foot">
                  <span className="approve">Approve next sprint</span>
                  <span className="label">3 samples per prompt per assistant</span>
                </div>
              </AgencyCard>
            </div>
          </div>
        </div>
      </section>

      {/* 6 · API */}
      <section className="sec" id="api">
        <div className="wrap">
          <SecHead n={6} title="API: the same numbers, in your own tools">
            A read-only REST API for your agency&apos;s data. Responses carry the same intervals and
            caveats as the screens, so a figure does not lose its basis when it lands in another
            dashboard.
          </SecHead>
          <div className="split even">
            <div className="card pad">
              <div className="cap" style={{ marginBottom: 6 }}>
                Endpoints · GET · Bearer key
              </div>
              <table className="ep">
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={e.path}>
                      <td className="m">GET</td>
                      <td className="p">{e.path}</td>
                      <td className="w">{e.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="basis" style={{ marginTop: 12 }}>
                A key is shown once, right after it is created; only a hash of it is stored. Another
                agency&apos;s client returns “not found”.
              </div>
            </div>
            <pre className="code" aria-label="Example request and abridged response">
              <span className="c"># window: 7–90 days, default 28</span>
              {"\ncurl https://app.citeworthy.example/api/v1/clients/"}
              <span className="n">cl_8f2a</span>
              {"/visibility?windowDays=28 \\\n  -H "}
              <span className="s">&quot;Authorization: Bearer $CITEWORTHY_KEY&quot;</span>
              {"\n\n"}
              <span className="c">{"// abridged, illustrative response"}</span>
              {"\n{\n  "}
              <span className="k">&quot;data&quot;</span>
              {": {\n    "}
              <span className="k">&quot;client&quot;</span>: <span className="s">&quot;{CLIENT}&quot;</span>
              {",\n    "}
              <span className="k">&quot;windowDays&quot;</span>: <span className="n">28</span>
              {",\n    "}
              <span className="k">&quot;cells&quot;</span>
              {": [\n      {\n        "}
              <span className="k">&quot;prompt&quot;</span>:{" "}
              <span className="s">&quot;best project tool for a small design studio&quot;</span>
              {",\n        "}
              <span className="k">&quot;platform&quot;</span>: <span className="s">&quot;chatgpt&quot;</span>
              {",\n        "}
              <span className="k">&quot;sharePct&quot;</span>: <span className="n">44.4</span>
              {",\n        "}
              <span className="k">&quot;interval&quot;</span>: [<span className="n">27.1</span>,{" "}
              <span className="n">62.9</span>]
              {",\n        "}
              <span className="k">&quot;samples&quot;</span>: <span className="n">36</span>
              {",\n        "}
              <span className="k">&quot;sufficient&quot;</span>: <span className="n">true</span>
              {"\n      }\n    ]\n  }\n}"}
            </pre>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap closing">
          <h2 className="h1">See it on one of your own clients first</h2>
          <div>
            <p className="prose">
              The free audit runs the first three parts once and hands you the result as a report in
              your brand: a measurement pass, the diagnosis and ranked work. Nothing is charged to
              run it.
            </p>
            <div className="ctas" style={{ marginTop: 22 }}>
              <Link className="btn primary" href="/signup">
                Start a free audit
              </Link>
              <Link className="link" href="/pricing">
                See pricing →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
