"use client";

import { useState } from "react";
import { billingPeriod, formatUsd } from "@repo/core";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Wallet } from "lucide-react";

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

/** Последние 12 периодов: дальше в прошлое смотреть незачем, а список короткий. */
function recentPeriods(count = 12): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) =>
    billingPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))),
  );
}

export function UsageView() {
  const [period, setPeriod] = useState(() => billingPeriod());
  const costs = api.billing.costs.useQuery({ period });

  const data = costs.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <label htmlFor="period" className="text-sm text-muted-foreground">
          Billing period
        </label>
        <select
          id="period"
          data-testid="usage-period"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          className={cn(controlClass, "h-10 px-2.5")}
        >
          {recentPeriods().map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {data && data.fixtureAnswers > 0 && (
        <p data-testid="usage-fixtures" className="text-sm text-muted-foreground">
          {/* Прогоны на фикстурах ничего не стоят: показывать их в счёте
              значило бы называть расходом то, чего не было. */}
          <span className="metric">{data.fixtureAnswers}</span> answers in this period came from
          fixtures — no assistant was asked and nothing was charged, so they are not in the totals
          below.
        </p>
      )}

      {data && data.rows.length === 0 ? (
        <EmptyState
          title="No measurement cost in this period"
        icon={Wallet}
          description="Cost appears once checks have run against the live assistants. Every answer stores what it cost, so this page always matches the raw responses."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-lg border p-5">
              <span className="text-sm text-muted-foreground">Total cost</span>
              <span data-testid="usage-total" className="metric text-3xl font-semibold tracking-tight">
                {data ? formatUsd(data.totalCostUsd) : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-5">
              <span className="text-sm text-muted-foreground">Answers measured</span>
              <span data-testid="usage-responses" className="metric text-3xl font-semibold tracking-tight">
                {data ? data.totalResponses : "—"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">By client</h2>
            <table data-testid="usage-by-client" className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 text-right font-medium">Answers</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(data?.clients ?? []).map((row) => (
                  <tr key={row.clientId} className="border-b last:border-0">
                    <td className="py-2">{row.clientName}</td>
                    <td className="metric py-2 text-right">{row.responses}</td>
                    <td
                      data-testid={`usage-client-${row.clientId}`}
                      className="metric py-2 text-right"
                    >
                      {formatUsd(row.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">By client and platform</h2>
            <table data-testid="usage-by-platform" className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Platform</th>
                  <th className="py-2 text-right font-medium">Answers</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row) => (
                  <tr key={`${row.clientId}-${row.platform}`} className="border-b last:border-0">
                    <td className="py-2">{row.clientName}</td>
                    <td className="py-2">{PLATFORM_LABELS[row.platform] ?? row.platform}</td>
                    <td className="metric py-2 text-right">{row.responses}</td>
                    <td className="metric py-2 text-right">{formatUsd(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
