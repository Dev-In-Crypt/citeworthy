import { PageHeader } from "@/components/page-header";
import { BillingView } from "./billing-view";

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Plan"
        description="What your agency is on, what it covers, and how to change it."
      />
      <BillingView />
    </>
  );
}
