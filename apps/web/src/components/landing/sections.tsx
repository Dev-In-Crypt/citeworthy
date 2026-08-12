import Link from "next/link";
import { SAMPLE_HIGHLIGHTS } from "@repo/core";
import {
  AUDIENCE,
  AUDIT_STEPS,
  FAQ,
  LIMITS,
  MANUAL_WORK,
  PLAN_CARDS,
  PRICING_NOTES,
  STEPS,
  VISIBILITY_BASIS,
} from "./content";
import { VisibilityGap } from "./visibility-gap";

/** Секции лендинга. Данные и тексты — в ./content.ts, здесь только разметка. */

const SECTION = "mx-auto w-full max-w-5xl px-6";

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-semibold tracking-tight">{children}</h2>
      {hint && <p className="max-w-prose text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Hero() {
  return (
    <section className={`${SECTION} flex flex-col gap-10 py-16 sm:py-24`}>
      <div className="flex max-w-3xl flex-col gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Sell and deliver AI Search retainers without adding headcount
        </h1>
        <p className="text-lg text-muted-foreground">
          Find where your clients disappear from AI answers, work out which sources decide it, and
          hand the client a report in your own brand that shows what changed and what the evidence
          is.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/signup"
          data-testid="landing-cta-audit"
          className="h-11 rounded-md bg-primary px-5 text-sm font-medium leading-[2.75rem] text-primary-foreground"
        >
          Run a free audit on one of your clients
        </Link>
        <Link
          href="/sample-report"
          className="h-11 rounded-md border border-input px-5 text-sm font-medium leading-[2.75rem] hover:bg-accent"
        >
          See an example report
        </Link>
      </div>

      <VisibilityGap />
    </section>
  );
}

export function ReportIsTheProduct() {
  return (
    <section className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle hint="Agencies do not buy a dashboard. They buy the document they put in front of their client — so look at that first.">
        The report is the deliverable
      </SectionTitle>

      <dl data-testid="landing-report-figures" className="grid gap-4 sm:grid-cols-3">
        <Figure
          label="Visibility over the quarter"
          value={`${SAMPLE_HIGHLIGHTS.deliveryBefore}% → ${SAMPLE_HIGHLIGHTS.deliveryAfter}%`}
          hint={`${SAMPLE_HIGHLIGHTS.deliveryDeltaPp >= 0 ? "+" : ""}${SAMPLE_HIGHLIGHTS.deliveryDeltaPp} pp across the period`}
        />
        <Figure
          label="Gap to the strongest competitor"
          value={`${SAMPLE_HIGHLIGHTS.deliveryGapBefore} pp → ${SAMPLE_HIGHLIGHTS.deliveryGapAfter} pp`}
          hint="Still behind, and the report says so"
        />
        <Figure
          label="Most influential action"
          value={SAMPLE_HIGHLIGHTS.deliveryContribution}
          hint="Estimated contribution, with a confidence level"
        />
      </dl>

      <p className="max-w-prose text-sm text-muted-foreground">{VISIBILITY_BASIS}</p>

      <Link
        href="/sample-report"
        className="h-10 w-fit rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
      >
        Open the full example
      </Link>
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="metric text-2xl font-semibold tracking-tight">{value}</dd>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function DeliverySystem() {
  return (
    <section className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle hint="Per client, every week, someone on your team would otherwise do this by hand:">
        This is a delivery system, not another tracker
      </SectionTitle>

      <ul className="flex max-w-prose flex-col gap-2 text-sm">
        {MANUAL_WORK.map((item) => (
          <li key={item} className="flex gap-3 border-b pb-2 last:border-0">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="max-w-prose text-muted-foreground">
        On one client that is an afternoon. On ten it is a full-time role you have to hire, train
        and keep busy. The product is priced against the retainers it supports, so the comparison
        that matters is with that hire.
      </p>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle>How it works</SectionTitle>

      <ol data-testid="landing-steps" className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-lg border p-5">
            <span className="metric text-sm text-muted-foreground">0{index + 1}</span>
            <span className="font-medium">{step.title}</span>
            <span className="text-sm text-muted-foreground">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FreeAudit() {
  return (
    <section className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle hint="The way in is the same thing you would sell: pick one client, measure them, and see whether the result is worth a conversation.">
        Start with one client, for free
      </SectionTitle>

      <ol data-testid="landing-audit" className="flex flex-col gap-2 text-sm">
        {AUDIT_STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-lg border p-4">
            <span className="metric shrink-0 text-muted-foreground">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/signup"
          className="h-11 rounded-md bg-primary px-5 text-sm font-medium leading-[2.75rem] text-primary-foreground"
        >
          Start a free audit
        </Link>
        <Link
          href="/sample-report/audit"
          className="h-11 rounded-md border border-input px-5 text-sm font-medium leading-[2.75rem] hover:bg-accent"
        >
          See what the audit produces
        </Link>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle hint={PRICING_NOTES.unit}>Pricing</SectionTitle>

      <ul data-testid="pricing-plans" className="grid gap-4 lg:grid-cols-3">
        {PLAN_CARDS.map((plan) => (
          <li key={plan.id} className="flex flex-col gap-4 rounded-lg border p-6">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{plan.name}</span>
              <span className="text-sm text-muted-foreground">{plan.audience}</span>
            </div>

            <div className="flex items-baseline gap-1">
              <span
                data-testid={`plan-price-${plan.id}`}
                className="metric text-3xl font-semibold tracking-tight"
              >
                ${plan.priceUsd.toLocaleString("en-US")}
              </span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>

            <dl className="flex flex-col gap-1.5 border-t pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Client accounts</dt>
                <dd className="metric font-medium">up to {plan.clientLimit}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">AI checks / month</dt>
                <dd className="metric font-medium">
                  {plan.aiCheckAllowance.toLocaleString("en-US")}
                </dd>
              </div>
            </dl>

            <Link
              href="/signup"
              className="mt-auto h-10 rounded-md bg-primary px-4 text-center text-sm font-medium leading-10 text-primary-foreground"
            >
              Start with the free audit
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex max-w-prose flex-col gap-2 text-sm text-muted-foreground">
        <p>{PRICING_NOTES.included}</p>
        <p>{PRICING_NOTES.frame}</p>
        <p>{PRICING_NOTES.checkout}</p>
      </div>
    </section>
  );
}

export function HonestLimits() {
  return (
    <section className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle hint="Stated here rather than in the footnotes, because you will repeat these lines to your own client.">
        What this does not do
      </SectionTitle>

      <dl data-testid="landing-limits" className="grid gap-4 sm:grid-cols-2">
        {LIMITS.map((limit) => (
          <div key={limit.title} className="flex flex-col gap-1 rounded-lg border border-dashed p-5">
            <dt className="font-medium">{limit.title}</dt>
            <dd className="text-sm text-muted-foreground">{limit.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Audience() {
  return (
    <section className={`${SECTION} grid gap-8 border-t py-16 sm:grid-cols-2`}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Built for</h2>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {AUDIENCE.forYou.map((item) => (
            <li key={item} className="rounded-lg border p-4">
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Not built for</h2>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {AUDIENCE.notForYou.map((item) => (
            <li key={item} className="rounded-lg border border-dashed p-4">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className={`${SECTION} flex flex-col gap-8 border-t py-16`}>
      <SectionTitle>Questions agencies ask first</SectionTitle>

      <dl data-testid="landing-faq" className="flex flex-col gap-5">
        {FAQ.map((item) => (
          <div key={item.question} className="flex flex-col gap-1.5 border-b pb-5 last:border-0">
            <dt className="font-medium">{item.question}</dt>
            <dd className="max-w-prose text-sm text-muted-foreground">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className={`${SECTION} flex flex-col items-start gap-5 border-t py-16`}>
      <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
        Pick one client and see what the assistants say about them
      </h2>
      <p className="max-w-prose text-muted-foreground">
        The audit runs on your own account and costs nothing to try. If the result is dull, you have
        lost an afternoon; if it is not, you have a conversation to sell.
      </p>
      <Link
        href="/signup"
        className="h-11 rounded-md bg-primary px-5 text-sm font-medium leading-[2.75rem] text-primary-foreground"
      >
        Create your agency account
      </Link>
    </section>
  );
}
