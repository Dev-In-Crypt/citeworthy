"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { DiagnoseView } from "./diagnose-view";

export default function DiagnosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = api.clients.get.useQuery({ id });

  if (client.error) {
    return <PageHeader title="Client not found" description="It may have been removed." />;
  }

  return (
    <>
      <PageHeader
        title="Diagnose"
        description="Which sources shape the answers, who appears in them, and where the client is missing."
        action={
          <Link
            href={`/clients/${id}`}
            className="h-10 rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
          >
            Overview
          </Link>
        }
      />
      <DiagnoseView clientId={id} />
    </>
  );
}
