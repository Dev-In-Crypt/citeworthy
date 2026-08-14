"use client";

import Link from "next/link";
import { CONFIDENCE_LABELS, MEASUREMENT_COPY } from "@repo/core";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";

/**
 * Портфель — первый экран агентства.
 *
 * Отвечает на два вопроса сразу: как идут дела у каждого клиента и чем
 * заняться сейчас. Клиент, не набравший порог сэмплов, показывает прочерк:
 * число в этой клетке было бы догадкой, а по портфелю принимают решения,
 * кому уделить неделю.
 */

function formatPct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function formatPp(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value} pp`;
}

export function Portfolio() {
  const portfolio = api.clients.portfolio.useQuery();
  const rows = portfolio.data ?? [];

  if (portfolio.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (rows.length === 0) {
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

  const thin = rows.filter((row) => !row.sufficient).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table data-testid="portfolio-table" className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 font-medium">Client</th>
              <th className="py-2 text-right font-medium">Named in</th>
              <th className="py-2 text-right font-medium">Gap to best</th>
              <th className="py-2 text-right font-medium">Change</th>
              <th className="py-2 font-medium">Confidence</th>
              <th className="py-2 font-medium">Needs you</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clientId} className="border-b last:border-0">
                <td className="py-2.5">
                  <Link
                    href={`/clients/${row.clientId}`}
                    className="flex flex-col underline-offset-4 hover:underline"
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{row.domain}</span>
                  </Link>
                </td>
                <td
                  data-testid={`portfolio-pct-${row.clientId}`}
                  className="metric py-2.5 text-right font-medium"
                >
                  {formatPct(row.visibilityPct)}
                </td>
                <td className="metric py-2.5 text-right text-competitor">
                  {formatPp(row.gapPp)}
                </td>
                <td
                  className={cn(
                    "metric py-2.5 text-right",
                    row.deltaPp === null && "text-muted-foreground",
                    row.deltaPp !== null && row.deltaPp > 0 && "text-client",
                    row.deltaPp !== null && row.deltaPp < 0 && "text-competitor",
                  )}
                >
                  {formatPp(row.deltaPp)}
                </td>
                <td className="py-2.5">
                  <span
                    className={cn(
                      "metric rounded-full px-2 py-1 text-[11px] font-medium",
                      row.confidence === "low"
                        ? "bg-competitor/12 text-competitor"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {row.confidence} · {row.sampleCount} samples
                  </span>
                </td>
                <td className="py-2.5">
                  {row.needs.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Link
                      href={`/clients/${row.clientId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {row.needs.join(" · ")}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {thin > 0 && (
        <p data-testid="portfolio-thin" className="text-sm text-muted-foreground">
          {thin} {thin === 1 ? "client shows" : "clients show"} a dash instead of a number.{" "}
          {MEASUREMENT_COPY.underFloor}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {CONFIDENCE_LABELS.medium} and above means the share is readable; below it, treat the row as
        a direction rather than a figure.
      </p>
    </div>
  );
}
