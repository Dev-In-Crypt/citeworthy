"use client";

import { use } from "react";
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
      />
      <ExperimentsView clientId={id} />
    </>
  );
}
