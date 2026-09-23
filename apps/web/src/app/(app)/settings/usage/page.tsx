import { PageHeader } from "@/components/page-header";
import { UsageView } from "./usage-view";

/**
 * Внутренняя страница агентства: на что ушёл лимит проверок тарифа.
 * Клиенту эти цифры не показываются — ни в отчёте, ни в PDF.
 */
export default function UsagePage() {
  return (
    <>
      <PageHeader
        title="Usage"
        description="Where this month's AI checks went, by client and assistant. Every answer is counted as it happens, so these totals come from the responses themselves."
      />
      <UsageView />
    </>
  );
}
