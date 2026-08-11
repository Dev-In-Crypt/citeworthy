"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";

export function ClientsView() {
  const clients = api.clients.list.useQuery();

  if (clients.isPending) {
    return <p className="text-sm text-muted-foreground">Loading clients…</p>;
  }

  if (clients.error) {
    return (
      <p role="alert" data-testid="form-error" className="text-sm text-destructive">
        {clients.error.message}
      </p>
    );
  }

  if (!clients.data || clients.data.length === 0) {
    return (
      <EmptyState
        title="No clients yet"
        description="Add your first client to start measuring how often AI assistants mention them, and where competitors show up instead."
        action={
          <Link
            href="/clients/new"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium leading-10 text-primary-foreground"
          >
            Add client
          </Link>
        }
      />
    );
  }

  return (
    <ul data-testid="clients-list" className="grid gap-3 sm:grid-cols-2">
      {clients.data.map((client) => (
        <li key={client.id}>
          <Link
            href={`/clients/${client.id}`}
            className="flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{client.name}</span>
              <span className="text-sm text-muted-foreground">{client.domain}</span>
            </div>

            <div className="flex gap-6 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Visibility</span>
                {/* Метрики появятся в T24 — заглушка честно говорит, что данных ещё нет. */}
                <span className="metric text-lg font-semibold">—</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Competitors</span>
                <span className="metric text-lg font-semibold">
                  {client.competitorNames.length}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
