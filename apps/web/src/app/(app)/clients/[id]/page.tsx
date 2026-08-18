"use client";

import { use } from "react";
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

  /**
   * Заголовка здесь нет намеренно: имя клиента и домен уже стоят во вкладках,
   * а «Overview / Where this client stands right now» повторяло вкладку своим
   * же словом и отодвигало первую цифру на треть экрана вниз.
   */
  return <ClientOverview clientId={id} />;
}
