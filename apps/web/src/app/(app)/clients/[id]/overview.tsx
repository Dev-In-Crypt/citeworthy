"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";

const PLATFORMS = [
  { value: null, label: "All platforms" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "perplexity", label: "Perplexity" },
  { value: "gemini", label: "Gemini" },
] as const;

type PlatformFilter = (typeof PLATFORMS)[number]["value"];

const COMPETITOR_COLORS = [
  "var(--color-competitor)",
  "oklch(0.68 0.15 70)",
  "oklch(0.62 0.12 40)",
  "oklch(0.72 0.10 90)",
];

function StatCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span data-testid={testId} className="metric text-2xl font-semibold tracking-tight">
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function ClientOverview({ clientId }: { clientId: string }) {
  const [platform, setPlatform] = useState<PlatformFilter>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);

  const clusters = api.prompts.clusters.useQuery({ clientId });
  const data = api.measurement.visibility.useQuery({ clientId, platform, clusterId });

  if (data.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const latest = data.data?.latest ?? null;
  const series = data.data?.series ?? [];
  const competitors = (data.data?.competitorNames ?? []).slice(0, 4);

  const chartData = series.map((point) => {
    const row: Record<string, string | number> = {
      week: new Date(point.periodStart).toISOString().slice(0, 10),
      client: point.clientVisibilityPct,
    };
    for (const competitor of competitors) {
      row[competitor] = point.competitorVisibility[competitor] ?? 0;
    }
    return row;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI visibility"
          testId="stat-visibility"
          value={latest ? `${latest.visibilityPct}%` : "—"}
          hint={
            latest
              ? latest.deltaPp === null
                ? `${latest.sampleCount} answers this week`
                : `${latest.deltaPp >= 0 ? "+" : ""}${latest.deltaPp} pp vs previous week`
              : "No measurements yet"
          }
        />
        <StatCard
          label="Competitor gap"
          testId="stat-gap"
          value={latest ? `${latest.competitorGapPp} pp` : "—"}
          hint="Against the best-performing tracked competitor"
        />
        <StatCard label="Open actions" value="—" hint="Action queue lands in T40" />
        <StatCard label="Last report" value="—" hint="Reporting lands in T50" />
      </div>

      {latest && !latest.sufficient && (
        <p
          data-testid="insufficient-warning"
          className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
        >
          Fewer than {latest.minSamples} answers in this window. Treat the number as indicative
          until more runs land — a single answer is not a measurement.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">Visibility over time</h2>
          <div className="flex gap-2">
            <select
              aria-label="Platform"
              value={platform ?? ""}
              onChange={(e) => setPlatform((e.target.value || null) as PlatformFilter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {PLATFORMS.map((option) => (
                <option key={option.label} value={option.value ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Cluster"
              value={clusterId ?? ""}
              onChange={(e) => setClusterId(e.target.value || null)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All clusters</option>
              {(clusters.data ?? []).map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {chartData.length === 0 ? (
          <EmptyState
            title="No visibility data yet"
            description="Run a check from the Measure screen. Visibility is read from the share of answers across a week, so the first useful reading appears once a run completes."
          />
        ) : (
          <div data-testid="visibility-chart" className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 12 }}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {/* Клиент — зелёным, конкуренты — оранжевыми оттенками (§4.3 плана). */}
                <Line
                  type="monotone"
                  dataKey="client"
                  stroke="var(--color-client)"
                  strokeWidth={2}
                  dot={false}
                />
                {competitors.map((competitor, index) => (
                  <Line
                    key={competitor}
                    type="monotone"
                    dataKey={competitor}
                    stroke={COMPETITOR_COLORS[index % COMPETITOR_COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Each point is the share of answers in that week mentioning the brand, across every sample
          taken. Never a single answer.
        </p>
      </section>
    </div>
  );
}
