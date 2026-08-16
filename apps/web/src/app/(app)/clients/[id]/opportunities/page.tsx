"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { OpportunitiesView } from "./opportunities-view";

export default function OpportunitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = api.clients.get.useQuery({ id });

  if (client.error) {
    return <PageHeader title="Client not found" description="It may have been removed." />;
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Where this client is losing in AI answers, why, and what is worth doing about it. Ranked for you, not for the client."
      />
      <OpportunitiesView clientId={id} />
    </>
  );
}
