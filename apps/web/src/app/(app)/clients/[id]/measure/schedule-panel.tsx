"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

const PLATFORMS = ["chatgpt", "perplexity", "gemini"] as const;
type Platform = (typeof PLATFORMS)[number];

type Cadence = "daily" | "weekly" | "biweekly";

const PLATFORM_LABELS: Record<Platform, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

const inputClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SchedulePanel({ clientId }: { clientId: string }) {
  const utils = api.useUtils();
  const schedule = api.runs.schedule.useQuery({ clientId });
  const runs = api.runs.list.useQuery({ clientId });

  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Пока прогон не завершён — опрашиваем статус. В mock-режиме он завершается
  // до первого опроса, в live будет реально «running».
  const activeRun = api.runs.get.useQuery(
    { id: activeRunId ?? "" },
    {
      enabled: activeRunId !== null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "done" || status === "failed" ? false : 1000;
      },
    },
  );

  /**
   * По умолчанию раз в две недели: ассистенты меняют ответы неделями, а
   * заметный сдвиг занимает 60–90 дней. Недельная частота нужна там, где идёт
   * эксперимент и важно точнее знать дату сдвига, — и стоит вдвое дороже.
   */
  const [cadence, setCadence] = useState<Cadence>("biweekly");
  const [platforms, setPlatforms] = useState<Platform[]>(["chatgpt", "perplexity", "gemini"]);
  const [samples, setSamples] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const saved = schedule.data;
  const save = api.runs.saveSchedule.useMutation({
    onSuccess: async () => {
      await utils.runs.schedule.invalidate({ clientId });
    },
  });

  const trigger = api.runs.triggerManual.useMutation({
    onSuccess: async (result) => {
      setError(null);
      setActiveRunId(result.runId);
      await Promise.all([utils.runs.list.invalidate({ clientId })]);
    },
    onError: (e) => setError(e.message),
  });

  function togglePlatform(platform: Platform): void {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((p) => p !== platform)
        : [...current, platform],
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Schedule</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Answers vary between runs, so each prompt is asked several times per platform and
          visibility is read from the share across a week — never from a single answer.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Cadence</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            className={inputClass}
          >
            <option value="biweekly">Every two weeks</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Samples per prompt</span>
          <input
            type="number"
            min={1}
            max={10}
            value={samples}
            onChange={(e) => setSamples(Number(e.target.value))}
            className={`${inputClass} w-24`}
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Platforms</legend>
          <div className="flex gap-3">
            {PLATFORMS.map((platform) => (
              <label key={platform} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={platforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                />
                {PLATFORM_LABELS[platform]}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          disabled={platforms.length === 0 || save.isPending}
          onClick={() =>
            save.mutate({ clientId, cadence, platforms, samplesPerPrompt: samples, active: true })
          }
          className="h-10 rounded-md border border-input px-4 text-sm font-medium disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save schedule"}
        </button>

        <button
          type="button"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate({ clientId })}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {trigger.isPending ? "Running…" : "Run now"}
        </button>
      </div>

      {saved && (
        <p data-testid="schedule-summary" className="text-sm text-muted-foreground">
          Saved: {saved.cadence}, {saved.samplesPerPrompt} samples per prompt,{" "}
          {saved.platforms.join(", ")}.
        </p>
      )}

      {error && (
        <p role="alert" data-testid="form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {activeRunId && (
        <p data-testid="run-status" className="text-sm">
          Latest run: <span className="font-medium">{activeRun.data?.status ?? "pending"}</span>
        </p>
      )}

      {(runs.data ?? []).length > 0 && (
        <ul data-testid="runs-list" className="flex flex-col gap-1 text-sm text-muted-foreground">
          {(runs.data ?? []).map((run) => (
            <li key={run.id} className="flex gap-3">
              <span className="metric">{new Date(run.startedAt).toLocaleString()}</span>
              <span>{run.trigger}</span>
              <span className="font-medium text-foreground">{run.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
