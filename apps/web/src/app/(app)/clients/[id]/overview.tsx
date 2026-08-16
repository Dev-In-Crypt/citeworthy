"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CONFIDENCE_LABELS, MEASUREMENT_COPY, shareOfNamed } from "@repo/core";
import { api, type RouterOutputs } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat";
import { MatrixSection } from "./matrix-view";
import { TrafficCard } from "./traffic";

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

interface WeekDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { sufficient?: boolean };
}

/**
 * Точка недели: закрашенная — измерение, полая — неделя ниже порога сэмплов.
 *
 * Такую неделю нельзя ни выбросить, ни нарисовать наравне с остальными:
 * выброшенная превратила бы провал в ровную линию, а равная — выдала бы
 * догадку за измерение.
 */
function renderWeekDot(props: unknown) {
  const { cx, cy, index, payload } = props as WeekDotProps;
  if (cx === undefined || cy === undefined) return <g key={index} />;

  const sufficient = payload?.sufficient !== false;

  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={3.5}
      fill={sufficient ? "var(--color-client)" : "var(--color-background)"}
      stroke="var(--color-client)"
      strokeWidth={sufficient ? 0 : 1.5}
      strokeDasharray={sufficient ? undefined : "2 2"}
    />
  );
}

/** Одна фраза, которую агентство перескажет своему клиенту. */
function OneLineRead({ matrix }: { matrix: RouterOutputs["measurement"]["matrix"] }) {
  const { totals, rows } = matrix;
  const competitor = totals.competitorTop;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Read as one line</h2>

      <p data-testid="one-line-read" className="text-sm text-muted-foreground">
        {totals.ratePct === null ? (
          MEASUREMENT_COPY.noDataYet
        ) : (
          <>
            {matrix.client.name} is named in an estimated{" "}
            <span className="metric font-medium text-foreground">{Math.round(totals.ratePct)}%</span>{" "}
            of answers to the {rows.length} tracked {rows.length === 1 ? "prompt" : "prompts"}
            {totals.interval && (
              <>
                {" "}
                (<span className="metric">
                  {Math.round(totals.interval.low)}–{Math.round(totals.interval.high)}%
                </span>{" "}
                on this sample)
              </>
            )}
            {matrix.totalsDeltaPp !== null && (
              <>
                , {matrix.totalsDeltaPp === 0 ? "flat" : matrix.totalsDeltaPp > 0 ? "up" : "down"}{" "}
                <span className="metric">{Math.abs(matrix.totalsDeltaPp)} pp</span> against the
                previous {matrix.windowDays} days
                {/* Пересекающиеся интервалы — это «не различить», а не «выросло». */}
                {!matrix.totalsDistinguishable && (
                  <span data-testid="within-noise"> — {MEASUREMENT_COPY.withinNoise}</span>
                )}
              </>
            )}
            .
            {competitor && (
              <>
                {" "}
                {competitor.name} is named in {Math.round(competitor.pct)}% of the same answers.
              </>
            )}
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-client/15 px-2 py-1 text-[11px] font-medium">
          {CONFIDENCE_LABELS[totals.confidence].toLowerCase()}
        </span>
        <span className="metric rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {totals.samples} answers sampled
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
          estimated
        </span>
      </div>
    </div>
  );
}

/**
 * Как именно назван клиент, а не только назван ли.
 *
 * Ответ, где клиент стоит четвёртым в списке «а ещё бывают», и ответ, где он
 * назван первым, дают одну и ту же долю упоминаний, но продают по-разному.
 * Порядок брендов парсер сохраняет с самого начала — считать заново нечего.
 */
function ProminenceCard({ matrix }: { matrix: RouterOutputs["measurement"]["matrix"] }) {
  const { prominence } = matrix;

  const first = shareOfNamed(prominence.namedFirst, prominence.named);
  const behind = shareOfNamed(prominence.behindCompetitors, prominence.named);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">How you are named</h2>

      {prominence.named === 0 || !prominence.sufficient ? (
        <p data-testid="prominence-empty" className="text-sm text-muted-foreground">
          {prominence.answers === 0
            ? MEASUREMENT_COPY.noDataYet
            : prominence.named === 0
              ? "Not named in any sampled answer in this window."
              : MEASUREMENT_COPY.underFloor}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Named first</dt>
              <dd data-testid="prominence-first" className="metric text-lg font-semibold">
                {first === null ? "—" : `${Math.round(first)}%`}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">After a competitor</dt>
              <dd data-testid="prominence-behind" className="metric text-lg font-semibold">
                {behind === null ? "—" : `${Math.round(behind)}%`}
              </dd>
            </div>
          </dl>

          <p className="text-sm text-muted-foreground">
            Of the <span className="metric">{prominence.named}</span> answers naming{" "}
            {matrix.client.name}, this is where the brand sits among the others. Typical place:{" "}
            <span className="metric">{prominence.averageRank}</span> of the brands named.
          </p>
        </>
      )}
    </div>
  );
}

/** Очередь работ — сколько открыто и сколько ждёт перепроверки. */
function QueueCard({ clientId }: { clientId: string }) {
  const actions = api.actions.list.useQuery({ clientId });
  const rows = actions.data ?? [];

  const open = rows.filter((action) => action.status !== "done" && action.status !== "dropped");
  const awaiting = rows.filter((action) => action.status === "done");

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Queue</h2>
      <div className="flex items-baseline gap-2">
        <span data-testid="queue-open" className="metric text-2xl font-semibold">
          {open.length}
        </span>
        <span className="text-sm text-muted-foreground">
          {open.length === 1 ? "action open" : "actions open"} · {awaiting.length} awaiting re-check
        </span>
      </div>
      <Link
        href={`/clients/${clientId}/actions`}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Open the queue →
      </Link>
    </div>
  );
}

export function ClientOverview({ clientId }: { clientId: string }) {
  const [platform, setPlatform] = useState<PlatformFilter>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);

  const clusters = api.prompts.clusters.useQuery({ clientId });
  const data = api.measurement.visibility.useQuery({ clientId, platform, clusterId });
  const matrix = api.measurement.matrix.useQuery({ clientId });

  if (data.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const latest = data.data?.latest ?? null;
  const series = data.data?.series ?? [];
  const competitors = (data.data?.competitorNames ?? []).slice(0, 4);
  const thinWeeks = series.filter((point) => !point.sufficient).length;

  const chartData = series.map((point) => {
    const row: Record<string, string | number | boolean> = {
      week: new Date(point.periodStart).toISOString().slice(0, 10),
      client: point.clientVisibilityPct,
      sufficient: point.sufficient,
    };
    for (const competitor of competitors) {
      row[competitor] = point.competitorVisibility[competitor] ?? 0;
    }
    return row;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Что именно человек видит на этом экране — до того, как он прочтёт первую цифру. */}
      <p
        data-testid="method-note"
        className="flex items-start gap-2.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
      >
        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
        {MEASUREMENT_COPY.methodNote}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
        {matrix.data ? (
          <MatrixSection matrix={matrix.data} />
        ) : (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            {matrix.isPending ? "Loading…" : MEASUREMENT_COPY.noDataYet}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {matrix.data && <OneLineRead matrix={matrix.data} />}
          {matrix.data && <ProminenceCard matrix={matrix.data} />}

          {/* Общая доля за последнюю неделю: матрица показывает, где именно
              провал, а эта цифра — то, что агентство называет клиенту, и её
              можно пересчитать по сырым ответам. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label="Named in answers"
              testId="stat-visibility"
              value={latest ? `${latest.visibilityPct}%` : "—"}
              hint={
                latest
                  ? latest.deltaPp === null
                    ? `${latest.sampleCount} answers this week`
                    : `${latest.deltaPp >= 0 ? "+" : ""}${latest.deltaPp} pp vs previous week`
                  : MEASUREMENT_COPY.noDataYet
              }
            />
            <StatCard
              label="Gap to the strongest competitor"
              testId="stat-gap"
              value={latest ? `${latest.competitorGapPp} pp` : "—"}
              hint="Against the best-performing tracked competitor, same answers"
            />
          </div>

          <TrafficCard clientId={clientId} />
          <QueueCard clientId={clientId} />
        </div>
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
                  dot={renderWeekDot}
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
          {MEASUREMENT_COPY.visibilityBasis}
          {thinWeeks > 0 && (
            <>
              {" "}
              <span data-testid="thin-weeks">
                {thinWeeks} {thinWeeks === 1 ? "week is" : "weeks are"} drawn hollow:{" "}
                {MEASUREMENT_COPY.underFloor}
              </span>
            </>
          )}
        </p>
      </section>

      <ActivityFeed clientId={clientId} />
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  action_created: "Action created",
  action_status_changed: "Action moved",
  action_completed: "Action completed",
  run_finished: "Check finished",
  report_generated: "Report generated",
  report_approved: "Report approved",
};

/** Лента событий — то, из чего собирается раздел «что сделано» в отчёте клиенту. */
function ActivityFeed({ clientId }: { clientId: string }) {
  const activity = api.actions.activity.useQuery({ clientId, limit: 10 });
  const entries = activity.data ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-base font-medium">Recent activity</h2>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing has happened for this client yet. Runs and actions show up here as they land.
        </p>
      ) : (
        <ul data-testid="activity-feed" className="flex flex-col gap-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-3">
              <span className="metric shrink-0 text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
              <span className="font-medium">{EVENT_LABELS[entry.eventType] ?? entry.eventType}</span>
              <span className="truncate text-muted-foreground">
                {typeof entry.payload["title"] === "string"
                  ? entry.payload["title"]
                  : typeof entry.payload["status"] === "string"
                    ? `${String(entry.payload["answers"] ?? "")} answers · ${entry.payload["status"]}`
                    : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
