import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ClientsView } from "./clients-view";

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Clients"
        description="Every client you manage, with the brands and competitors you track for them."
        action={
          <Link
            href="/clients/new"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium leading-10 text-primary-foreground"
          >
            Add client
          </Link>
        }
      />
      <ClientsView />
    </>
  );
}
