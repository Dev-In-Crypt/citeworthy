import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BillingView } from "./billing-view";

/**
 * Тариф и расход — один вопрос: сколько осталось и сколько за это платить.
 * Поэтому они под одним пунктом меню, а не под двумя, и ссылка на разбор
 * расхода стоит прямо здесь, а не в навигации.
 */
export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Plan and usage"
        description="What your agency is on, what it covers, and where this month's checks went."
        action={
          <Link
            href="/settings/usage"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Where the checks went →
          </Link>
        }
      />
      <BillingView />
    </>
  );
}
