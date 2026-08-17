"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ClientOverview } from "./overview";
import { buttonClass } from "@/components/ui/button";

export default function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = api.clients.get.useQuery({ id });

  if (client.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Чужой клиент отдаётся как NOT_FOUND — интерфейс не подтверждает его существование.
  if (client.error || !client.data) {
    return (
      <>
        <PageHeader title="Client not found" description="It may have been removed." />
        <p data-testid="form-error" className="text-sm text-muted-foreground">
          Nothing to show here.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Where this client stands right now, and what to do next."
        action={
          <Link
            href={`/clients/${id}/measure`}
            className={buttonClass("primary", "lg")}
          >
            Measure
          </Link>
        }
      />
      <ClientOverview clientId={id} />
    </>
  );
}
