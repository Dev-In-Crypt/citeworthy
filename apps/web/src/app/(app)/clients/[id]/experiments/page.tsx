"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ExperimentsView } from "./experiments-view";

export default function ExperimentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = api.clients.get.useQuery({ id });

  if (client.error) {
    return <PageHeader title="Client not found" description="It may have been removed." />;
  }

  return (
    <>
      <PageHeader
        title="Experiments"
        description="What was done, when, and what happened afterwards — shown against a comparison group."
        action={
          <Link
            href={`/clients/${id}/actions`}
            className="h-10 rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
          >
            Actions
          </Link>
        }
      />
      <ExperimentsView clientId={id} />
    </>
  );
}
