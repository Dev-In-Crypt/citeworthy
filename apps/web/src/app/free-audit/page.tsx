import type { Metadata } from "next";
import Link from "next/link";
import { MARKETING_COPY, REPORT_COPY, SAMPLE_AUDIT_REPORT, SAMPLE_HIGHLIGHTS } from "@repo/core";
import { AgencyCard } from "@/components/marketing/agency-card";
import { Conf, Faq, SecHead } from "@/components/marketing/bits";
import { MarketingShell } from "@/components/marketing/chrome";
import { AUDIT_FAQ_AFTER, AUDIT_STEPS } from "@/components/marketing/content";
import { AGENCIES, AUDIT_COMPETITORS, CLIENT, signed, usd } from "@/components/marketing/data";

/**
 * Бесплатный аудит — главный вход в продукт.
 *
 * Карточка отчёта собрана из того же примера аудита, что и /sample-report/audit:
 * доля клиента, средняя по конкурентам, разрыв, предложенный ретейнер. Маржа
 * агентства из примера сюда не выводится — это внутренняя экономика агентства.
 */

export const metadata: Metadata = {
  title: "Free audit · Citeworthy",
  description:
    "Audit one of your own clients for free: one measurement pass, a diagnosis, ranked work with reasons, and an opportunity report in your brand.",
};

const H = SAMPLE_HIGHLIGHTS;
const OPPORTUNITY = SAMPLE_AUDIT_REPORT.opportunity;
const BAR_MAX = 50;

/** Ранжированная работа в карточке: причины переписаны на домены .example, как во всей витрине. */
const RANKED = [
  {
    title: "Get the client covered on reviewhub.example",
    reason: `Reason: cited in 18% of answers for this category (14 citations); Quillstack and Loambox appear, ${CLIENT} does not. Impact: high · Effort: medium`,
  },
  {
    title: "Get the client covered on forum.example",
    reason: `Reason: cited in 12% of answers (9 citations); threads comparing the category name competitors, not ${CLIENT}. Impact: medium · Effort: medium`,
  },
  {
    title: "Publish a page that answers this cluster directly",
    reason: "Reason: no fernpost.example page is among the 9 sources cited for the comparison cluster. Impact: medium · Effort: medium",
  },
];

const GET = [
  {
    title: "A measurement pass",
    body: "Your client's buyer prompts, asked on ChatGPT, Perplexity and Gemini, three samples each. Every answer and every cited source is stored.",
    who: "on one of your own clients",
  },
  {
    title: "A diagnosis",
    body: "Which sources carry the category, which ones name competitors and not your client, and whether the gap is on the client's own pages or outside them.",
    who: "based on sources actually cited",
  },
  {
    title: "Ranked work",
    body: "A list of what to do, in order, with a reason attached to each item and an estimated impact and effort.",
    who: "every item has a reason",
  },
  {
    title: "An opportunity report",
    body: "A report in your logo and colour, with the diagnosis, the ranked work and your proposed engagement, ready to send.",
    who: "white-label, link or PDF",
  },
];

const FLOW_WHO: { label: string; ours?: boolean }[][] = [
  [{ label: "you" }],
  [{ label: "drafted for you", ours: true }, { label: "you edit" }],
  [{ label: "runs for you", ours: true }],
  [{ label: "you read" }],
  [{ label: "built for you", ours: true }, { label: "you send" }],
];

const FAQ = [
  {
    q: "Which assistants does the audit use?",
    a: `ChatGPT, Perplexity and Gemini, each with its own cited sources. Claude and Grok can be switched on per client later. ${MARKETING_COPY.notMeasuredSurfaces}`,
  },
  { q: "What happens right after the audit?", a: AUDIT_FAQ_AFTER },
  {
    q: "What if we want to keep measuring the client?",
    a: (
      <>
        Ongoing weekly measurement is what the plans cover. There is no self-serve checkout yet:
        accounts are set up with us, so tell us when you are ready. <Link href="/pricing">See pricing</Link>.
      </>
    ),
  },
];

export default function FreeAuditPage() {
  return (
    <MarketingShell active="audit">
      <div className="wrap">
        <section className="fa-hero">
          <div>
            <div className="kicker page-kicker">Free audit</div>
            <h1 className="display">
              Audit one of your own clients, <em>for free.</em>
            </h1>
            <p className="lead">
              One measurement pass on one of your clients, a diagnosis of the sources behind the
              answers, ranked work with a reason on each item, and an opportunity report in your
              brand that you can send as it is.
            </p>
            <div className="ctas">
              <Link className="btn primary" href="/signup">
                Create your agency account
              </Link>
              <a className="link" href="#preview">
                See a sample audit report ↓
              </a>
            </div>
          </div>
          <aside className="card cost" aria-label="What it costs">
            <div className="cap">What it costs</div>
            <div className="v">$0</div>
            <p className="small">The audit runs on your own account and costs nothing to try.</p>
            <ul>
              <li>No card: there is no checkout on the site at all</li>
              <li>One client, one pass, the full diagnosis</li>
              <li>The report is yours to send, or not</li>
            </ul>
            <div className="basis">
              If the result is dull, you have lost an afternoon; if it is not, you have a
              conversation to sell.
            </div>
          </aside>
        </section>
      </div>

      {/* 1 · что получает агентство */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={1} title="What your agency gets">
            The way in is the same thing you would sell: pick one client, measure them, and see
            whether the result is worth a conversation.
          </SecHead>
          <ol className="get">
            {GET.map((item, i) => (
              <li className="card" key={item.title}>
                <span className="num">{i + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <span className="label who">{item.who}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 2 · пять шагов */}
      <section className="sec">
        <div className="wrap five">
          <div>
            <SecHead n={2} title="Five steps, one client">
              You choose the client and check the questions. The product does the asking, reading
              and ranking.
            </SecHead>
            <div className="note">
              The prompts matter more than anything else here. Generated prompts are a starting
              draft; edit them until they read the way your client&apos;s buyers actually ask.
            </div>
          </div>
          <ol className="flow">
            {AUDIT_STEPS.map((step, i) => (
              <li key={step}>
                <span className="n">{i + 1}</span>
                <div>
                  <b>{step}</b>
                  <span className="who">
                    {FLOW_WHO[i]?.map((w) => (
                      <span key={w.label} className={w.ours ? "who-chip p" : "who-chip"}>
                        {w.label}
                      </span>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 3 · как выглядит отчёт аудита */}
      <section className="sec" id="preview">
        <div className="wrap">
          <SecHead n={3} title="What the audit report looks like">
            This is the example audit, with invented names. Your client sees your agency&apos;s logo
            and colour, and nothing of ours.
          </SecHead>
          <div className="prev">
            <div>
              <ol className="anat">
                <li>
                  <span>
                    <b>Where the client stands today.</b> Share of sampled answers naming the client,
                    next to the tracked competitors&apos; average.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Who is named instead.</b> Each tracked competitor&apos;s share from the same
                    answers.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Ranked work for the next 90 days.</b> Each item with its reason, estimated
                    impact and effort. The full list continues past the first page.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Your proposed engagement.</b> {REPORT_COPY.scopeEstimate}
                  </span>
                </li>
                <li>
                  <span>
                    <b>The caveats.</b> A single measurement of how assistants answer today, not a
                    forecast of results.
                  </span>
                </li>
              </ol>
              <p style={{ marginTop: 20 }}>
                <Link className="link" href="/sample-report/audit">
                  Open the full example audit report →
                </Link>
              </p>
            </div>
            <div className="wl-stage">
              <AgencyCard
                agencies={AGENCIES}
                initial={1}
                ariaLabel="Example white-label audit report"
                testId="audit-report"
                meta={
                  <>
                    Audit for {CLIENT}
                    <br />5–12 Jan 2026
                  </>
                }
              >
                <div className="r-title">Where {CLIENT} stands in AI answers today</div>
                <div className="r-sub">
                  One measurement pass · ChatGPT, Perplexity, Gemini · 72 sampled answers
                </div>
                <div className="r-stats">
                  <div>
                    <b>{H.auditVisibilityPct}%</b>
                    <span>
                      visibility today · {signed(H.auditGapPp)} pp versus the competitor average
                    </span>
                  </div>
                  <div>
                    <b>{H.auditCompetitorAvgPct}%</b>
                    <span>tracked competitors, average share of answers</span>
                  </div>
                </div>
                <div className="bars" role="img" aria-label="Share of answers by brand">
                  {AUDIT_COMPETITORS.map((c) => (
                    <div key={c.name}>
                      <span style={{ color: "#CA3500" }}>{c.name}</span>
                      <span className="b">
                        <i style={{ width: `${(c.pct / BAR_MAX) * 100}%`, background: "#F54900", opacity: c.opacity }} />
                      </span>
                      <span className="p">{c.pct}%</span>
                    </div>
                  ))}
                  <div>
                    <span style={{ color: "#008236", fontWeight: 600 }}>{CLIENT}</span>
                    <span className="b">
                      <i style={{ width: `${(H.auditVisibilityPct / BAR_MAX) * 100}%`, background: "#00A63E" }} />
                    </span>
                    <span className="p" style={{ color: "#008236" }}>
                      {H.auditVisibilityPct}%
                    </span>
                  </div>
                </div>
                <div className="r-sec">
                  <h5>
                    Ranked work for the next 90 days · {RANKED.length} of {H.auditActions}
                  </h5>
                  <ol className="r-next">
                    {RANKED.map((item) => (
                      <li key={item.title}>
                        <div>
                          {item.title}
                          <span>{item.reason}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                {OPPORTUNITY && (
                  <div className="prop">
                    <div>
                      <span>Proposed engagement</span>
                      <br />
                      <b>{usd(OPPORTUNITY.suggestedRetainerUsd)} / month</b>
                    </div>
                    <span>
                      estimated effort: {OPPORTUNITY.estimatedEffortHours.min}–
                      {OPPORTUNITY.estimatedEffortHours.max} h per month
                    </span>
                  </div>
                )}
                <div className="r-caveat">{REPORT_COPY.opportunityBasis}</div>
                <div className="r-foot">
                  <Conf level="low" />
                  <span className="label">one pass · 3 samples per prompt</span>
                </div>
              </AgencyCard>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · чем аудит не является */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={4} title="What the audit is not">
            Worth knowing before you send it, because your client will read it as a promise if you
            let them.
          </SecHead>
          <div className="g2">
            <div className="limit">
              <h3>Not a forecast of results</h3>
              <p>{MARKETING_COPY.auditNotForecast}</p>
            </div>
            <div className="limit">
              <h3>A snapshot, not a trend</h3>
              <p>{MARKETING_COPY.auditSnapshot}</p>
            </div>
            <div className="limit">
              <h3>Not our pitch to your client</h3>
              <p>
                The report carries your brand only. The proposed retainer and effort are your
                figures, not ours, and the report says so.
              </p>
            </div>
            <div className="limit">
              <h3>Nothing is published</h3>
              <p>
                The audit reads what assistants already answer. Nothing changes on the client&apos;s
                site, and the report goes nowhere until you send it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5 · вопросы */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={5} title="Before you start" />
          <Faq items={FAQ} />
        </div>
      </section>

      <section className="sec">
        <div className="wrap closing">
          <h2 className="h1">Pick one client and see what the assistants say about them</h2>
          <div>
            <p className="prose">
              Create the agency account, add the client, and run the pass. The report is yours to
              send.
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
