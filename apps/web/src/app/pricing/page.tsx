import type { Metadata } from "next";
import Link from "next/link";
import { Faq, SecHead } from "@/components/marketing/bits";
import { MarketingShell } from "@/components/marketing/chrome";
import { AUDIT_FAQ_AFTER, PRICING_NOTES } from "@/components/marketing/content";
import { PLANS, TYPICAL_CHECKS_PER_CLIENT, int, usd } from "@/components/marketing/data";

/**
 * Тарифы.
 *
 * Суммы и лимиты — только из `PLAN_LIMITS` (через `PLANS`), никаких литералов:
 * это те же числа, по которым API ограничивает клиентов. Условия — только
 * утверждённые основателем (см. `PRICING_NOTES`); чего нет в утверждённом,
 * того нет и на странице.
 */

export const metadata: Metadata = {
  title: "Pricing · Citeworthy",
  description: `Three plans, billed per active client account: ${PLANS.map((p) => `${p.name} ${usd(p.priceUsd)}`).join(", ")} a month. What counts as a client and what an AI check is.`,
};

const clientLimits = PLANS.map((p) => p.clientLimit);
const clientLimitsText = `${clientLimits.slice(0, -1).join(", ")} or ${clientLimits.at(-1)}`;

const INCLUDED = [
  {
    title: "Measurement",
    body: "ChatGPT, Perplexity and Gemini by default; Claude and Grok per client. At least three samples per prompt per assistant, weekly.",
  },
  {
    title: "Diagnosis",
    body: "The sources assistants cite, grouped by kind, with where competitors appear and your client does not.",
  },
  { title: "Actions board", body: "Ranked opportunities, each with a reason, turned into work with an owner." },
  {
    title: "Experiments",
    body: "Before and after for the work you log, compared with untouched topics, shown as a range.",
  },
  {
    title: "White-label reports",
    body: "A link your client opens without an account, in your logo and colour, with nothing of ours on it.",
  },
  { title: "PDF export", body: "The same report as a PDF, for clients who forward documents rather than links." },
];

const FAQ = [
  { q: "Do you charge per seat?", a: `No. ${PRICING_NOTES.unit} ${PRICING_NOTES.seats}` },
  { q: "What exactly is an AI check?", a: PRICING_NOTES.checks },
  { q: "What happens if we go past the allowance?", a: PRICING_NOTES.overage },
  { q: "What if we need more clients than the plan allows?", a: PRICING_NOTES.clientLimit },
  { q: "Do Claude and Grok cost extra?", a: PRICING_NOTES.extraAssistants },
  { q: "Can we pay by card on the site?", a: `Not yet. ${PRICING_NOTES.checkout}` },
  { q: "Is the free audit really free?", a: `Yes. ${AUDIT_FAQ_AFTER}` },
];

export default function PricingPage() {
  return (
    <MarketingShell active="pricing">
      <div className="wrap">
        <section className="pr-hero">
          <div>
            <div className="kicker page-kicker">Pricing</div>
            <h1 className="display">
              Priced per client account, <em>not per seat.</em>
            </h1>
            <p className="lead">
              {PRICING_NOTES.unit} {PRICING_NOTES.included} The price is set against the retainer
              revenue it supports, not against the price of a rank tracker.
            </p>
          </div>
          <aside className="card howbuy">
            <div className="cap">How buying works today</div>
            <p className="h4">No self-serve checkout yet</p>
            <p className="small">
              Accounts are set up with us. Start with the free audit on one of your clients; if it is
              worth a conversation, you talk to the founder, agree the plan, and billing is set up.
            </p>
            <Link className="btn primary" href="/free-audit">
              Start with the free audit
            </Link>
          </aside>
        </section>

        <ul className="plans" aria-label="Plans" data-testid="pricing-plans">
          {PLANS.map((plan) => (
            <li key={plan.id} className="card plan" data-testid={`plan-${plan.id}`}>
              <div>
                <h2 className="name">{plan.name}</h2>
                <p className="aud-line">{plan.audience}</p>
              </div>
              <div className="price">
                <b data-testid={`plan-price-${plan.id}`}>{usd(plan.priceUsd)}</b>
                <span>/ month</span>
              </div>
              <dl className="kv">
                <div>
                  <dt>Client accounts</dt>
                  <dd data-testid={`plan-clients-${plan.id}`}>up to {plan.clientLimit}</dd>
                </div>
                <div>
                  <dt>AI checks / month</dt>
                  <dd data-testid={`plan-checks-${plan.id}`}>{int(plan.aiCheckAllowance)}</dd>
                </div>
              </dl>
              <p className="per">
                ≈ {int(plan.checksPerClient)} checks per client · a typical client uses ~
                {int(TYPICAL_CHECKS_PER_CLIENT)}
              </p>
              <ul>
                <li>Measurement, diagnosis and reports on every client</li>
                <li>White-label reports and PDF export</li>
                <li>No charge per seat</li>
              </ul>
              <Link className="btn secondary" href="/free-audit">
                Start with the free audit
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* 1 · единицы */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={1} title="Two units: clients and AI checks">
            The plan limits two things. Everything else, including the number of people on your
            team, is not counted.
          </SecHead>
          <div className="defs">
            <div className="card def">
              <div className="cap">What counts as a client</div>
              <p className="big">
                One brand you measure, with its own prompts, competitors, sources, board and reports.
              </p>
              <p className="small">
                The plan sets how many client accounts can be active at once: {clientLimitsText}.
                Adding a client beyond that means moving to the next plan, and the product asks you
                to rather than failing quietly.
              </p>
              <div className="basis">Billing unit: the active client account. Not seats, not sources, not prompts.</div>
            </div>
            <div className="card def">
              <div className="cap">What an AI check is</div>
              <p className="big">One answer from one assistant to one prompt.</p>
              <div className="eq" role="img" aria-label="1 prompt times 1 assistant times 1 answer equals 1 AI check">
                <span className="t"><b>1</b><span>prompt</span></span>
                <span className="op">×</span>
                <span className="t"><b>1</b><span>assistant</span></span>
                <span className="op">×</span>
                <span className="t"><b>1</b><span>answer</span></span>
                <span className="op">=</span>
                <span className="t res"><b>1</b><span>AI check</span></span>
              </div>
              <div className="basis">
                Asking the same prompt three times on ChatGPT is three checks. Visibility needs at
                least three samples per prompt per assistant.
              </div>
            </div>
          </div>

          <div className="card use" data-testid="allowance">
            <div>
              <div className="h4">How far the allowance goes</div>
              <p className="small" style={{ marginTop: 4 }} data-testid="pricing-checks">
                {PRICING_NOTES.checks}
              </p>
            </div>
            {PLANS.map((plan) => (
              <div className="use-row" key={plan.id}>
                <span className="n">{plan.name}</span>
                <span className="meter" aria-hidden>
                  <i style={{ width: `${Math.round((plan.typicalUse / plan.aiCheckAllowance) * 100)}%` }} />
                </span>
                <span className="v">
                  {plan.clientLimit} × {int(TYPICAL_CHECKS_PER_CLIENT)} ≈ {int(plan.typicalUse)} of{" "}
                  {int(plan.aiCheckAllowance)}
                </span>
              </div>
            ))}
            <div className="legend" style={{ fontSize: 12.5 }}>
              <span>
                <i className="sw" style={{ height: 10, background: "#3C414B" }} />
                typical use, every client full
              </span>
              <span>
                <i className="sw" style={{ height: 10, background: "#EFEDE7" }} />
                headroom in the allowance
              </span>
            </div>
            <div className="basis">
              {PRICING_NOTES.extraAssistants} {PRICING_NOTES.overage}
            </div>
          </div>
        </div>
      </section>

      {/* 2 · что входит */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={2} title="Included in every plan">
            {PRICING_NOTES.included} Plans differ only in how many clients and checks they cover.
          </SecHead>
          <ol className="incl">
            {INCLUDED.map((item, i) => (
              <li key={item.title}>
                <span className="num">{i + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 3 · как купить */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={3} title="How to start">
            There is no self-serve checkout yet, so there is no “Buy now” button to pretend with.
            This is the actual path.
          </SecHead>
          <ol className="buy">
            <li className="card">
              <span className="num">1</span>
              <h3>Run the free audit</h3>
              <p>Create an agency account and audit one of your own clients. Nothing is charged to run it.</p>
            </li>
            <li className="card">
              <span className="num">2</span>
              <h3>Talk to the founder</h3>
              <p>
                If the result is worth a conversation, say how many clients you plan to measure and
                agree the plan together.
              </p>
            </li>
            <li className="card">
              <span className="num">3</span>
              <h3>Billing is set up</h3>
              <p>Accounts and billing are set up with us directly, and the plan&apos;s limits apply from then on.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* 4 · вопросы */}
      <section className="sec">
        <div className="wrap">
          <SecHead n={4} title="Billing questions" />
          <Faq items={FAQ} testId="pricing-faq" />
        </div>
      </section>

      <section className="sec">
        <div className="wrap closing">
          <h2 className="h1">Price it against the retainer, after you have seen the audit</h2>
          <div>
            <p className="prose">
              Run the audit on one client first. You will know what the numbers look like for your
              own book before any plan is agreed.
            </p>
            <div className="ctas" style={{ marginTop: 22 }}>
              <Link className="btn primary" href="/signup">
                Start a free audit
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
