import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Portfolio } from "./portfolio";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Every client, how often assistants name them, and what is waiting on a person. Figures are estimated from repeated samples and refresh on each run."
        action={
          <Link
            href="/clients/new"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium leading-10 text-primary-foreground"
          >
            Add client
          </Link>
        }
      />
      <Portfolio />
    </>
  );
}
