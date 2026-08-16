"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Навигация по клиенту — в два уровня.
 *
 * Первый уровень — решения: что происходит, что делать, что делаем, что
 * показать клиенту. Второй — приборы: измерения, источники, сырые ответы.
 * Раньше всё лежало в один ряд, и владелец агентства жил внутри
 * измерительного инструмента вместо того, чтобы принимать решения.
 *
 * Адреса при этом не переименованы. Двадцать из двадцати трёх сквозных
 * тестов ходят по ним напрямую, и агентство — тоже, по памяти.
 */

/**
 * `as const` здесь обязателен: типизированные роуты Next проверяют literal
 * type ссылки, и без него `/clients/${id}/${segment}` перестаёт быть известным
 * адресом и становится просто строкой.
 */
const TABS = [
  { segment: "", label: "Overview" },
  { segment: "opportunities", label: "Opportunities" },
  { segment: "actions", label: "Work" },
  { segment: "reports", label: "Report" },
  { segment: "measure", label: "Analytics" },
  { segment: "settings", label: "Settings" },
] as const;

/** Второй уровень: приборы внутри своего раздела. */
const SUBTABS = {
  actions: [
    { segment: "actions", label: "Actions" },
    { segment: "experiments", label: "Experiments" },
  ],
  measure: [
    { segment: "measure", label: "Visibility" },
    { segment: "diagnose", label: "Sources" },
  ],
} as const;

/**
 * Какому разделу принадлежит адрес. Вложенные экраны подсвечивают свой
 * раздел: отдельный промпт живёт внутри измерений, эксперименты — внутри
 * работы.
 */
const SEGMENT_TO_TAB: Record<string, string> = {
  prompts: "measure",
  diagnose: "measure",
  experiments: "actions",
};

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const client = api.clients.get.useQuery({ id: clientId });

  const base = `/clients/${clientId}`;
  const current = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const segment = current.split("/")[0] ?? "";
  const activeTab = SEGMENT_TO_TAB[segment] ?? segment;

  const isProspect = client.data?.status === "prospect";
  const children = SUBTABS[activeTab as keyof typeof SUBTABS] ?? null;

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
            aria-current={activeTab === "audit" ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5",
              activeTab === "audit"
                ? "bg-primary font-medium text-primary-foreground"
                : "text-primary hover:bg-accent",
            )}
          >
            Run audit
          </Link>
        )}

        {TABS.map((tab) => {
          const isActive = activeTab === tab.segment;

          return (
            <Link
              key={tab.segment || "overview"}
              // Ссылка собирается прямо здесь: типизированные роуты Next
              // проверяют только литерал, склейка из переменной для них
              // уже просто строка.
              href={tab.segment ? `/clients/${clientId}/${tab.segment}` : `/clients/${clientId}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5",
                isActive
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children && (
        <nav data-testid="client-subtabs" className="flex flex-wrap gap-4 text-sm">
          {children.map((child) => {
            const isActive = segment === child.segment;

            return (
              <Link
                key={child.segment}
                href={`/clients/${clientId}/${child.segment}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "border-b-2 pb-1",
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
