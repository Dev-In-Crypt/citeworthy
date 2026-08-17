import Link from "next/link";
import type { ReportPayload } from "@repo/core";
import { SAMPLE_AGENCY } from "@repo/core";
import { ReportView } from "@/components/report-view";
import { MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";
import { buttonClass } from "@/components/ui/button";

/**
 * Обрамление публичного примера.
 *
 * Всё, что нужно витрине — пояснение, переключатель, призыв к действию, —
 * живёт вокруг `ReportView`, а не внутри него: компонент обязан оставаться
 * ровно тем документом, который получает клиент агентства. Любой пропс вида
 * `variant` или `showBanner` протёк бы отсюда на `/r/[token]` и в PDF.
 */

export function SampleFrame({
  payload,
  variant,
}: {
  payload: ReportPayload;
  variant: "delivery" | "audit";
}) {
  return (
    <>
      <MarketingHeader />

      <div className="border-b bg-secondary/40">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-5">
          <p data-testid="sample-report-notice" className="text-sm text-muted-foreground">
            Fictional agency, fictional client, invented numbers. The layout and the wording are
            the ones your client receives — this page renders the same component the product does.
          </p>

          <nav data-testid="sample-report-switch" className="flex flex-wrap gap-2 text-sm">
            <SwitchLink href="/sample-report" active={variant === "delivery"}>
              Quarterly retainer report
            </SwitchLink>
            <SwitchLink href="/sample-report/audit" active={variant === "audit"}>
              Free audit report
            </SwitchLink>
          </nav>
        </div>
      </div>

      <main>
        <ReportView payload={payload} agency={SAMPLE_AGENCY} approved={null} />
      </main>

      <div className="border-t">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-6 py-10">
          <h2 className="text-lg font-medium">Run this for one of your clients</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            The audit takes one measurement pass across all three platforms and ends on a page like
            this one, in your brand rather than ours.
          </p>
          <Link
            href="/signup"
            className={buttonClass("primary", "lg")}
          >
            Start a free audit
          </Link>
        </div>
      </div>

      <MarketingFooter />
    </>
  );
}

function SwitchLink({
  href,
  active,
  children,
}: {
  href: "/sample-report" | "/sample-report/audit";
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-md border border-input bg-background px-3 py-1.5 font-medium shadow-sm"
          : "rounded-md px-3 py-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
      }
    >
      {children}
    </Link>
  );
}
