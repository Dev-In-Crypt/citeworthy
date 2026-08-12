"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ReportsView } from "./reports-view";

export default function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = api.clients.get.useQuery({ id });

  if (client.error) {
    return <PageHeader title="Client not found" description="It may have been removed." />;
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Client-facing reports. They carry your agency's brand and nothing else."
        action={
          <Link
            href={`/clients/${id}`}
            className="h-10 rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
          >
            Overview
          </Link>
        }
      />
      <ReportsView clientId={id} />
    </>
  );
}
