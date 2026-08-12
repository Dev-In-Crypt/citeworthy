import { PageHeader } from "@/components/page-header";
import { UsageView } from "./usage-view";

/**
 * Внутренняя страница агентства: сколько стоят измерения.
 * Клиенту эти цифры не показываются — ни в отчёте, ни в PDF.
 */
export default function UsagePage() {
  return (
    <>
      <PageHeader
        title="Usage and cost"
        description="What the AI checks cost you, by client and platform. Every answer records its own cost, so these totals come from the responses themselves."
      />
      <UsageView />
    </>
  );
}
