"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Вкладки клиента.
 *
 * Раньше это был ряд кнопок на обзоре, который уводил на отдельные страницы
 * без пути назад: экраны выглядели вкладками, но ими не были. Теперь они
 * рядом на каждом экране клиента, и видно, где ты находишься.
 */

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "measure", label: "Measure" },
  { segment: "diagnose", label: "Diagnose" },
  { segment: "actions", label: "Actions" },
  { segment: "experiments", label: "Experiments" },
  { segment: "reports", label: "Reports" },
  { segment: "settings", label: "Settings" },
] as const;

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const client = api.clients.get.useQuery({ id: clientId });

  const base = `/clients/${clientId}`;
  const current = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  // Вложенные экраны подсвечивают свой раздел: отдельный промпт живёт внутри Measure.
  const segment = current.split("/")[0] ?? "";
  const activeSegment = segment === "prompts" ? "measure" : segment;

  const isProspect = client.data?.status === "prospect";

  return (
    <div className="mb-6 flex flex-col gap-3 border-b pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.data?.name ?? "Client"}
          </h1>
          {client.data && (
            <span className="text-sm text-muted-foreground">{client.data.domain}</span>
          )}
          {isProspect && (
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              prospect
            </span>
          )}
        </div>

        <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
          ← All clients
        </Link>
      </div>

      <nav data-testid="client-tabs" className="flex flex-wrap gap-1 text-sm">
        {isProspect && (
          <Link
            href={`/clients/${clientId}/audit`}
            data-testid="audit-link"
            aria-current={activeSegment === "audit" ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5",
              activeSegment === "audit"
                ? "bg-primary font-medium text-primary-foreground"
                : "text-primary hover:bg-accent",
            )}
          >
            Run audit
          </Link>
        )}

        {TABS.map((tab) => {
          const active = activeSegment === tab.segment;

          return (
            <Link
              key={tab.segment || "overview"}
              // Ссылка собирается прямо здесь: типизированные роуты Next
              // проверяют только литерал, склейка из переменной для них
              // уже просто строка.
              href={
                tab.segment ? `/clients/${clientId}/${tab.segment}` : `/clients/${clientId}`
              }
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5",
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
