"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ClientOverview } from "./overview";

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
        title={client.data.name}
        description={client.data.domain}
        action={
          <div className="flex gap-2">
            <Link
              href={`/clients/${id}/measure`}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium leading-10 text-primary-foreground"
            >
              Measure
            </Link>
            <Link
              href={`/clients/${id}/diagnose`}
              className="h-10 rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
            >
              Diagnose
            </Link>
            <Link
              href={`/clients/${id}/settings`}
              className="h-10 rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
            >
              Settings
            </Link>
          </div>
        }
      />
      <ClientOverview clientId={id} />
    </>
  );
}
