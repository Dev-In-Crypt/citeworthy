"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";

const EVENT_LABELS: Record<string, string> = {
  action_shipped: "Action shipped",
  indexed: "Page indexed",
  first_new_citation: "New cited source appeared",
  visibility_change: "Visibility moved",
  note: "Note",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "border-client text-foreground",
  medium: "border-input text-muted-foreground",
  low: "border-input text-muted-foreground",
};

export function ExperimentsView({ clientId }: { clientId: string }) {
  const experiments = api.experiments.list.useQuery({ clientId });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = experiments.data ?? [];
  const activeId = selectedId ?? rows[0]?.id ?? null;

  if (experiments.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No experiments yet"
        description="An experiment starts when you complete an action. It records the baseline at that moment, so what follows can be read against it."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <ul data-testid="experiments-list" className="flex shrink-0 flex-col gap-2 lg:w-64">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`w-full rounded-md border p-3 text-left text-sm ${
                row.id === activeId ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <span className="metric block text-muted-foreground">
                {new Date(row.actionDate).toLocaleDateString()}
              </span>
              <span className="text-muted-foreground">{row.status}</span>
            </button>
          </li>
        ))}
      </ul>

      {activeId && <ExperimentDetail experimentId={activeId} />}
    </div>
  );
}

function ExperimentDetail({ experimentId }: { experimentId: string }) {
  const detail = api.experiments.get.useQuery({ id: experimentId });

  if (detail.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!detail.data) {
    return <p className="text-sm text-muted-foreground">Nothing to show.</p>;
  }

  const { experiment, events, estimate, series, formattedEstimate } = detail.data;
  const actionWeek = new Date(experiment.actionDate).toISOString().slice(0, 10);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 data-testid="estimate-headline" className="metric text-xl font-semibold">
            {formattedEstimate}
          </h2>
          <span
            data-testid="confidence-badge"
            className={`rounded-full border px-3 py-1 text-sm ${CONFIDENCE_STYLE[estimate.confidence] ?? ""}`}
          >
            Confidence: {estimate.confidence}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Treated before</dt>
            <dd className="metric">{estimate.treatmentDeltaPp === null ? "—" : `${estimate.treatmentDeltaPp >= 0 ? "+" : ""}${estimate.treatmentDeltaPp} pp`}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Comparison group</dt>
            <dd className="metric">{estimate.controlDeltaPp === null ? "—" : `${estimate.controlDeltaPp >= 0 ? "+" : ""}${estimate.controlDeltaPp} pp`}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Action date</dt>
            <dd className="metric">{new Date(experiment.actionDate).toLocaleDateString()}</dd>
          </div>
        </dl>

        {/* Дисклеймер стоит рядом с цифрой, а не мелким шрифтом внизу страницы. */}
        <p data-testid="estimate-disclaimer" className="max-w-prose text-sm text-muted-foreground">
          {estimate.disclaimer}
        </p>

        <ul data-testid="evidence-list" className="flex flex-col gap-1 text-sm text-muted-foreground">
          {estimate.evidence.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-base font-medium">Treated clusters vs comparison group</h2>
        <div data-testid="experiment-chart" className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {/* Пунктир на дате действия: без него график не читается. */}
              <ReferenceLine x={actionWeek} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="treatment"
                stroke="var(--color-client)"
                strokeWidth={2}
                connectNulls
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="control"
                stroke="var(--color-competitor)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                connectNulls
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-medium">Timeline</h2>
        <ol data-testid="experiment-timeline" className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3 border-l pl-4 text-sm">
              <span className="metric shrink-0 text-muted-foreground">
                {new Date(event.occurredAt).toLocaleDateString()}
              </span>
              <span className="flex flex-col">
                <span className="font-medium">{EVENT_LABELS[event.type] ?? event.type}</span>
                {event.note && <span className="text-muted-foreground">{event.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
