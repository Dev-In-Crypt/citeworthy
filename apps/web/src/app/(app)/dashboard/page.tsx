import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Portfolio } from "./portfolio";
import { buttonClass } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Every client, how often assistants name them, and what is waiting on a person. Figures are estimated from repeated samples and refresh on each run."
        action={
          <Link
            href="/clients/new"
            className={buttonClass("primary", "lg")}
          >
            Add client
          </Link>
        }
      />
      <Portfolio />
    </>
  );
}
