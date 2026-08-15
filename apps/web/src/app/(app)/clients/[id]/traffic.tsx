"use client";

import { useRef, useState } from "react";
import { ASSISTANTS, MEASUREMENT_COPY } from "@repo/core";
import { api } from "@/trpc/react";

/**
 * Переходы от ассистентов.
 *
 * Стоит рядом с видимостью и никогда не смешивается с ней: это другое
 * наблюдение, из другого источника, с другим пределом. Переходы
 * недосчитываются — встроенные браузеры не передают источник, а часть людей
 * набирает название бренда руками, — и об этом сказано прямо на экране.
 */

const LABELS = new Map(ASSISTANTS.map((assistant) => [assistant.id, assistant.label]));

export function TrafficCard({ clientId }: { clientId: string }) {
  const utils = api.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ imported: number; skipped: string[] } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const summary = api.analytics.summary.useQuery({ clientId });

  const importTraffic = api.analytics.importTraffic.useMutation({
    onSuccess: async (data) => {
      setResult({ imported: data.imported, skipped: data.skippedReferrers });
      setErrors(data.errors);
      await utils.analytics.summary.invalidate({ clientId });
    },
    onError: (error) => setErrors([error.message]),
  });

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setResult(null);
    importTraffic.mutate({ clientId, csv: await file.text() });
    if (input.current) input.current.value = "";
  }

  const data = summary.data;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Traffic from assistants</h2>
        {data && (
          <span className="metric text-xs text-muted-foreground">last {data.windowDays} days</span>
        )}
      </div>

      {data && data.totalSessions > 0 ? (
        <>
          <div className="flex items-baseline gap-2">
            <span data-testid="traffic-total" className="metric text-2xl font-semibold">
              {data.totalSessions.toLocaleString("en-US")}
            </span>
            <span className="text-sm text-muted-foreground">sessions referred</span>
          </div>

          <ul data-testid="traffic-list" className="flex flex-col gap-1 text-sm">
            {data.byAssistant.map((entry) => (
              <li key={entry.assistant} className="flex justify-between gap-3">
                <span>{LABELS.get(entry.assistant) ?? entry.assistant}</span>
                <span className="metric text-muted-foreground">
                  {entry.sessions.toLocaleString("en-US")} · {entry.sharePct}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p data-testid="traffic-empty" className="text-sm text-muted-foreground">
          No referred sessions imported yet. Export the referral report from the client&apos;s
          analytics and drop it here — columns: date, source, sessions.
        </p>
      )}

      {/* Предел метрики стоит рядом с цифрой, а не в сноске под экраном. */}
      <p className="text-xs text-muted-foreground">{MEASUREMENT_COPY.trafficUndercount}</p>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" htmlFor="traffic-csv">
          Import a referral export
        </label>
        <input
          id="traffic-csv"
          ref={input}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="text-xs"
        />
      </div>

      {result && (
        <p data-testid="traffic-import" className="text-xs text-muted-foreground">
          Imported {result.imported} rows.
          {result.skipped.length > 0 &&
            ` Skipped sources that are not assistants: ${result.skipped.slice(0, 5).join(", ")}.`}
        </p>
      )}

      {errors.length > 0 && (
        <ul data-testid="traffic-errors" className="flex flex-col gap-1 text-xs text-destructive">
          {errors.slice(0, 5).map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
