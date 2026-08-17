"use client";

import { use } from "react";
import { OPPORTUNITY_COPY } from "@repo/core";
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
      {/* Описание одно и берётся из copy-констант: раньше та же мысль стояла
          дважды — в заголовке страницы и абзацем под ним. */}
      <PageHeader title="Opportunities" description={OPPORTUNITY_COPY.basis} />
      <OpportunitiesView clientId={id} />
    </>
  );
}
