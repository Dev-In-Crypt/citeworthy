"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { MeasureView } from "./measure-view";

export default function MeasurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = api.clients.get.useQuery({ id });

  if (client.error) {
    return <PageHeader title="Client not found" description="It may have been removed." />;
  }

  return (
    <>
      <PageHeader
        title="Measure"
        description={
          client.data
            ? `Buyer questions tracked for ${client.data.name}, grouped into clusters.`
            : "Buyer questions tracked for this client."
        }
      />
      <MeasureView clientId={id} />
    </>
  );
}
