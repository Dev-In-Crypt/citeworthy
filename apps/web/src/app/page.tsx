import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  DIAGNOSIS_COPY,
  MARKETING_COPY,
  MEASUREMENT_COPY,
  REPORT_COPY,
  SAMPLE_DELIVERY_REPORT,
  SAMPLE_HIGHLIGHTS,
} from "@repo/core";
import { auth } from "@/lib/auth";
import { AgencyCard } from "@/components/marketing/agency-card";
import { Conf, Faq, LegendLine, SecHead, SrcChip } from "@/components/marketing/bits";
import { MarketingShell } from "@/components/marketing/chrome";
import { ReportMiniChart, ShareChart } from "@/components/marketing/charts";
import {
  AUDIENCE,
  AUDIT_STEPS,
  LANDING_FAQ,
  LIMITS,
  MANUAL_WORK,
  PRICING_NOTES,
} from "@/components/marketing/content";
import { AGENCIES, ANSWERS_PER_WEEK, CLIENT, PLANS, int, signed, usd } from "@/components/marketing/data";

/**
 * Главная витрины. Залогиненного корень не задерживает: он пришёл работать,
 * а не читать про продукт.
 *
 * Цифры отчёта — из собранного примера (`SAMPLE_HIGHLIGHTS`), цены и лимиты —
 * из `PLAN_LIMITS` (через `PLANS`): переписанные руками, они однажды
 * разошлись бы с тем, что показывает пример и применяет API.
 */

export const metadata: Metadata = {
  title: "Citeworthy · AI Search retainers for agencies",
  description:
    "Measure how often AI assistants name each client, find the sources that decide it, and hand the client a report in your own brand.",
};

const H = SAMPLE_HIGHLIGHTS;
const HIGHEST = SAMPLE_DELIVERY_REPORT.highestImpactAction;

/** Раскраска мини-матрицы в карточке шага «Measure»: доли клиента, «конкурент назван», «не измерено». */
const MINI_MATRIX: string[] = [
  "g.32", "g.22", "g.17", "g.22", "off",
  "g.5", "g.56", "g.45", "g.5", "off",
  "g.17", "g.11", "g.22", "g.11", "off",
  "comp", "comp", "g.11", "floor", "off",
];

function miniCell(kind: string): React.CSSProperties {
  if (kind === "off") return { background: "#E7E5DE" };
  if (kind === "comp") return { background: "#FFF1E7", outline: "1px dashed #F54900", outlineOffset: -1 };
  if (kind === "floor") return { background: "#fff", outline: "1px solid #E3E1DA", outlineOffset: -1 };
  return { background: `rgb(0 166 62 / ${kind.slice(1)})` };
}

const SOURCES = [
  { domain: "reviewhub.example", kind: "gap", note: "gap", pct: 18, color: "#F54900" },
  { domain: "forum.example", kind: "gap", note: "gap", pct: 12, color: "#F54900" },
  { domain: "toolreview.example", kind: "has", note: "names both", pct: 9, color: "#3C414B" },
  { domain: "listings.example", kind: "gap", note: "gap", pct: 7, color: "#F54900" },
  { domain: "fernpost.example", kind: "has", note: "names client", pct: 6, color: "#00A63E" },
] as const;

/**
 * Стрелка «было → стало». Пробелы вокруг неё только для текста страницы
 * (копирование, чтение с экрана): видимый зазор задаёт отступ стрелки, иначе
 * крупная цифра не помещается в одну строку.
 */
function Arrow() {
  return (
    <span className="arr">
      <span className="sr"> </span>→<span className="sr"> </span>
    </span>
  );
}

const lowerFirst =(text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/dashboard");
  }

  const contribution = HIGHEST?.estimatedContribution ?? H.deliveryContribution;

  return (
    <MarketingShell>
      <div className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <div className="kicker">For agencies that sell AI Search</div>
            <h1 className="display" id="hero-title">
              Sell and deliver AI Search retainers <em>without adding headcount.</em>
            </h1>
            <p className="lead">
              Find where your clients disappear from AI answers, work out which sources decide it,
              and hand the client a report in your own brand that shows what changed and what the
              evidence is.
            </p>
            <div className="ctas">
              <Link className="btn primary" href="/signup" data-testid="landing-cta-audit">
                Run a free audit on one of your clients
              </Link>
              <Link className="btn secondary" href="/sample-report">
                See an example report
              </Link>
            </div>
            <div className="hero-meta">
              <span className="label">Measured assistants</span>
              <div className="chip-row">
                <span className="a-chip">ChatGPT</span>
                <span className="a-chip">Perplexity</span>
                <span className="a-chip">Gemini</span>
                <span className="a-chip opt">Claude · per client</span>
                <span className="a-chip opt">Grok · per client</span>
              </div>
            </div>
          </div>

          <div className="stage">
            <AgencyCard
              agencies={AGENCIES}
              hint="Preview in an agency's brand"
              ariaLabel="Example white-label client report page"
              testId="hero-report"
              meta={
                <>
                  Prepared for {CLIENT}
                  <br />Q2 · Apr–Jun 2026
                </>
              }
            >
              <div className="r-title">
                {CLIENT} is named in about {Math.round(H.deliveryAfter / 10)} in 10 AI answers
              </div>
              <div className="r-sub">
                Share of sampled answers · ChatGPT, Perplexity, Gemini · W15–W26 · example data
              </div>
              <div className="r-chart">
                <ReportMiniChart />
              </div>
              <div className="r-stats">
                <div>
                  <b>{H.deliveryAfter}%</b>
                  <span>
                    share of answers in W26 · ▲ {H.deliveryDeltaPp} pp since W15
                  </span>
                </div>
                <div>
                  <b>{signed(H.deliveryGapAfter)}</b>
                  <span>pp behind Quillstack, from {signed(H.deliveryGapBefore)} at the start</span>
                </div>
              </div>
              <div className="r-sec">
                <h5>What we&apos;ll do next · 1 of {SAMPLE_DELIVERY_REPORT.nextSprint.length}</h5>
                <ol className="r-next">
                  <li>
                    <div>
                      {SAMPLE_DELIVERY_REPORT.nextSprint[0]}
                      <span>
                        Reason: they are cited in answers that name Quillstack and Loambox, and{" "}
                        {CLIENT} is absent.
                      </span>
                    </div>
                  </li>
                </ol>
              </div>
              <div className="r-foot">
                <Conf level="medium" />
                <span className="label">3 samples per prompt per assistant</span>
              </div>
            </AgencyCard>
            <span className="label" style={{ textAlign: "center" }}>
              The toggle swaps the agency&apos;s logo and colour. Nothing on the page is ours.
            </span>
          </div>
        </section>
      </div>

      {/* 1 · проблема */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={1} title="Right now, someone on your team does this by hand">
            Clients have started asking what ChatGPT says about them. Answering properly, per client
            and every week, looks like this.
          </SecHead>
          <div className="manual">
            <div className="card">
              <div className="timesheet-head">
                <span className="kicker">Per client · every week</span>
                <span className="label">done by hand today</span>
              </div>
              <ol className="timesheet">
                {MANUAL_WORK.map((item, i) => (
                  <li key={item.text}>
                    <span className="i">0{i + 1}</span>
                    <span>{item.text}</span>
                    <span className="t">{item.when}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="pull">
                On one client that is an afternoon.{" "}
                <em>On ten it is a full-time role you have to hire, train and keep busy.</em>
              </p>
              <p className="prose" style={{ marginTop: 22 }}>
                Citeworthy does the asking, reading and collecting, and turns it into ranked work
                and a report. Your team keeps the part the client pays for: deciding what to do and
                doing it.
              </p>
              <p className="label" style={{ marginTop: 18 }}>
                {PRICING_NOTES.frame}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · как это работает */}
      <section className="sec" id="how">
        <div className="wrap">
          <SecHead n={2} title="Measure, diagnose, act, report">
            One loop per client. Each step feeds the next, and each one keeps its evidence attached.
          </SecHead>
          <ol className="g4" data-testid="landing-steps">
            <li className="card step">
              <div className="viz">
                <div className="mini-mx" aria-hidden>
                  {MINI_MATRIX.map((kind, i) => (
                    <i key={i} style={miniCell(kind)} />
                  ))}
                </div>
              </div>
              <span className="num">1</span>
              <h3>Measure</h3>
              <p>
                Ask ChatGPT, Perplexity and Gemini the questions your client&apos;s buyers actually
                ask, on a schedule, several samples each. Add Claude or Grok per client.
              </p>
            </li>
            <li className="card step">
              <div className="viz col">
                <SrcChip n={1} domain="reviewhub.example" kind="gap" note="gap" />
                <SrcChip n={2} domain="forum.example" kind="gap" note="gap" />
                <SrcChip n={3} domain="fernpost.example" kind="has" note="client" />
              </div>
              <span className="num">2</span>
              <h3>Diagnose</h3>
              <p>
                See which kinds of sources the models cite, and where competitors appear in them
                while your client does not.
              </p>
            </li>
            <li className="card step">
              <div className="viz">
                <div className="mini-act">
                  <b>Get covered on reviewhub.example</b>
                  <span>
                    Reason: cited in 18% of answers; Quillstack and Loambox appear, {CLIENT} does
                    not.
                  </span>
                </div>
              </div>
              <span className="num">3</span>
              <h3>Act</h3>
              <p>
                Turn the gaps into a board of work with an owner and a reason. Mark topics as
                untouched controls before you start.
              </p>
            </li>
            <li className="card step">
              <div className="viz">
                <div className="mini-rep" aria-hidden>
                  <div className="b" />
                  <div className="l" />
                  <div className="t" />
                  <div className="t short" />
                  <svg viewBox="0 0 120 40">
                    <path d="M9,26 L111,14 L111,22 L9,32Z" fill="rgb(0 166 62/.12)" />
                    <polyline points="9,29 40,26 70,22 111,18" fill="none" stroke="#00A63E" strokeWidth="2" />
                    <polyline points="9,10 40,9 70,10 111,9" fill="none" stroke="#F54900" strokeWidth="1.2" strokeDasharray="3 2" />
                  </svg>
                </div>
              </div>
              <span className="num">4</span>
              <h3>Report</h3>
              <p>
                Hand the client a link or a PDF in your brand, showing what moved, what was done and
                what the numbers do not settle.
              </p>
            </li>
          </ol>
          <p style={{ marginTop: 28 }}>
            <Link className="link" href="/product">
              See each step in the product →
            </Link>
          </p>
        </div>
      </section>

      {/* 3 · доказательная база цифр */}
      <section className="sec" id="evidence">
        <div className="wrap">
          <SecHead n={3} title="Every number arrives with its evidence">
            Visibility is the {lowerFirst(MEASUREMENT_COPY.visibilityBasis)} Next to it: what the
            assistants actually said, and the sources they cited.
          </SecHead>

          <div className="ev-grid">
            <div className="card ev-chart">
              <div className="ev-top">
                <div className="ev-title">
                  Share of answers <span>· {CLIENT} vs tracked competitors · weekly · example data</span>
                </div>
                <Conf level="medium" />
              </div>
              <div className="legend">
                <span>
                  <LegendLine kind="client" />
                  {CLIENT} (client)
                </span>
                <span>
                  <LegendLine kind="comp" />
                  Competitors
                </span>
                <span>
                  <LegendLine kind="band" />
                  90% estimate range
                </span>
              </div>
              <ShareChart />
              <div className="basis">
                {ANSWERS_PER_WEEK} answers a week · 24 prompts × 3 assistants × 3 samples · W15–W26
                2026
                <br />
                {MARKETING_COPY.readTheTrend}
              </div>
            </div>

            <div className="card srcs">
              <div>
                <div className="ev-title">Sources behind the gap</div>
                <div className="label" style={{ marginTop: 2 }}>
                  share of answers citing each source · W26
                </div>
              </div>
              <ul>
                {SOURCES.map((s, i) => (
                  <li key={s.domain}>
                    <div className="row">
                      <SrcChip n={i + 1} domain={s.domain} kind={s.kind} note={s.note} />
                      <span className="pct">{s.pct}%</span>
                    </div>
                    <span className="bar">
                      <i
                        style={{
                          width: `${s.pct * 4}%`,
                          background: s.color,
                          opacity: s.kind === "gap" ? 0.75 : s.color === "#3C414B" ? 0.55 : 1,
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="basis" style={{ marginTop: "auto" }}>
                {MARKETING_COPY.gapDefinition} {DIAGNOSIS_COPY.presenceCaveat}
              </div>
            </div>
          </div>

          <div className="tape">
            <div className="tape-head">
              <span className="kicker">
                Answer tape · W26 · “best project tool for a small design studio”
              </span>
              <span className="label">
                3 of {ANSWERS_PER_WEEK} answers this week · examples, shown after the aggregate
              </span>
            </div>
            <div className="tape-item">
              <div className="src">
                <span>ChatGPT · sample 3/3</span>
                <span>24 Jun</span>
              </div>
              <q>
                For small studios, <span className="nm-comp">Quillstack</span> and{" "}
                <span className="nm-client">{CLIENT}</span> are the usual picks. {CLIENT} is lighter
                to set up …
              </q>
              <div className="cites">
                <SrcChip n={1} domain="toolreview.example" kind="has" note="names both" />
              </div>
            </div>
            <div className="tape-item">
              <div className="src">
                <span>Perplexity · sample 1/3</span>
                <span>23 Jun</span>
              </div>
              <q>
                Most reviewers recommend <span className="nm-comp">Quillstack</span>, with{" "}
                <span className="nm-comp">Loambox</span> as a cheaper option …
              </q>
              <div className="cites">
                <SrcChip n={1} domain="reviewhub.example" kind="gap" note="gap" />
                <SrcChip n={2} domain="quillstack.example" kind="plain" />
              </div>
            </div>
            <div className="tape-item">
              <div className="src">
                <span>Gemini · sample 2/3</span>
                <span>22 Jun</span>
              </div>
              <q>
                <span className="nm-client">{CLIENT}</span> stands out for client-facing timelines
                and simple pricing …
              </q>
              <div className="cites">
                <SrcChip n={1} domain="fernpost.example/blog" kind="has" note="names client" />
              </div>
            </div>
          </div>
          <p className="label" style={{ marginTop: 12 }}>
            {MARKETING_COPY.answersStored}
          </p>
        </div>
      </section>

      {/* 4 · отчёт */}
      <section className="sec" id="sample-report">
        <div className="wrap">
          <SecHead n={4} title="The report is the deliverable">
            Agencies do not buy a dashboard. They buy the document they put in front of their
            client, so look at that first. This is a quarter from the example report.
          </SecHead>
          <div className="g3" data-testid="landing-report-figures">
            <div className="card metric">
              <div className="lab">Visibility over the quarter · {CLIENT}</div>
              <div className="v">
                {H.deliveryBefore}
                <small>%</small>
                <Arrow />
                {H.deliveryAfter}
                <small>%</small>
              </div>
              <div className="d up">▲ {H.deliveryDeltaPp} pp · W15 → W26</div>
              <Conf level="medium" />
              <div className="basis">share of sampled answers · 3 assistants · 3 samples per prompt</div>
            </div>
            <div className="card metric">
              <div className="lab">Gap to the strongest competitor</div>
              <div className="v sm">
                {signed(H.deliveryGapBefore)}
                <Arrow />
                {signed(H.deliveryGapAfter)}
              </div>
              <div className="d">pp behind Quillstack</div>
              <div className="small">Still behind, and the report says so.</div>
              <div className="basis">client share minus the leading tracked competitor&apos;s share</div>
            </div>
            <div className="card metric">
              <div className="lab">
                Most influential action · {HIGHEST?.title.toLowerCase() ?? "refreshed the comparison page"}
              </div>
              <div className="v">
                {contribution.replace(/\s*pp$/, "")}
                <small> pp</small>
              </div>
              <div className="d">{MARKETING_COPY.contributionAsRange}</div>
              <Conf level={HIGHEST?.confidence ?? "medium"} estimated={false} />
              <div className="basis">{REPORT_COPY.noComparisonGroup}</div>
            </div>
          </div>
          <div className="deliv-foot">
            <div className="card pad">
              <div className="cap" style={{ marginBottom: 10 }}>
                Work completed this quarter
              </div>
              <ul className="work">
                {H.deliveryWork.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <b>{item.count}</b>
                  </li>
                ))}
              </ul>
              <div className="basis" style={{ marginTop: 12 }}>
                {H.deliveryNewCitedUrls} newly cited URLs · {H.deliveryNewBrandMentions} new brand
                mentions in sampled answers
              </div>
            </div>
            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="cap">What the client receives</div>
              <ul className="rules">
                <li>
                  <span>
                    <b>A link that opens without an account</b>, or a PDF. Your logo and colour; the
                    product is not named anywhere.
                  </span>
                </li>
                <li>
                  <span>
                    <b>The caveats travel with it.</b> Each figure keeps its basis line, its
                    confidence level and the note on what the numbers do not settle.
                  </span>
                </li>
                <li>
                  <span>
                    <b>An approve button</b> for the next sprint, so the plan is agreed in writing.
                  </span>
                </li>
              </ul>
              <Link className="btn secondary" href="/sample-report" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
                Open the full example
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5 · тарифы коротко */}
      <section className="sec" id="pricing">
        <div className="wrap">
          <SecHead n={5} title="Priced per client account">
            {PRICING_NOTES.unit} {PRICING_NOTES.included}
          </SecHead>
          <ul className="g3" data-testid="pricing-plans">
            {PLANS.map((plan) => (
              <li key={plan.id} className="card pad plan-mini">
                <div>
                  <div className="h4">{plan.name}</div>
                  <div className="small muted">{plan.audience}</div>
                </div>
                <div className="price">
                  <b data-testid={`plan-price-${plan.id}`}>{usd(plan.priceUsd)}</b>
                  <span>/ month</span>
                </div>
                <dl className="kv">
                  <div>
                    <dt>Client accounts</dt>
                    <dd>up to {plan.clientLimit}</dd>
                  </div>
                  <div>
                    <dt>AI checks / month</dt>
                    <dd>{int(plan.aiCheckAllowance)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="row-between">
            <span className="label">{PRICING_NOTES.checkout}</span>
            <Link className="link" href="/pricing">
              Full pricing and what an AI check is →
            </Link>
          </div>
        </div>
      </section>

      {/* 6 · бесплатный аудит */}
      <section className="sec">
        <div className="wrap">
          <div className="card audit-band">
            <div>
              <div className="kicker" style={{ marginBottom: 14 }}>
                Free audit
              </div>
              <h2 className="h1">Start with one client, for free</h2>
              <p className="prose">
                The way in is the same thing you would sell: pick one client, measure them, and see
                whether the result is worth a conversation. You get a diagnosis, ranked work with a
                reason on each item, and a report in your brand.
              </p>
              <div className="ctas" style={{ marginTop: 26 }}>
                <Link className="btn primary" href="/signup">
                  Start a free audit
                </Link>
                <Link className="link" href="/free-audit#preview">
                  See what the audit produces →
                </Link>
              </div>
            </div>
            <ol className="steps" data-testid="landing-audit">
              {AUDIT_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 7 · пределы */}
      <section className="sec" id="limits">
        <div className="wrap">
          <SecHead n={6} title="What this does not do">
            Stated here rather than in the footnotes, because you will repeat these lines to your
            own client.
          </SecHead>
          <div className="g2" data-testid="landing-limits">
            {LIMITS.map((limit) => (
              <div className="limit" key={limit.title}>
                <h3>{limit.title}</h3>
                <p>{limit.body}</p>
                {limit.offChips && (
                  <div className="chip-row" style={{ marginTop: 12 }}>
                    <span className="a-chip off">Copilot</span>
                    <span className="a-chip off">AI Overviews</span>
                    <span className="a-chip off">AI Mode</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="aud">
            <div>
              <h3>Built for</h3>
              <ul>
                {AUDIENCE.forYou.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="no">
              <h3>Not built for</h3>
              <ul>
                {AUDIENCE.notForYou.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 8 · вопросы */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={7} title="Questions agencies ask first" />
          <Faq items={LANDING_FAQ} testId="landing-faq" />
        </div>
      </section>

      <section className="sec">
        <div className="wrap closing">
          <h2 className="h1">Pick one client and see what the assistants say about them</h2>
          <div>
            <p className="prose">
              The audit runs on your own account and costs nothing to try. If the result is dull,
              you have lost an afternoon; if it is not, you have a conversation to sell.
            </p>
            <div className="ctas" style={{ marginTop: 22 }}>
              <Link className="btn primary" href="/signup">
                Create your agency account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
