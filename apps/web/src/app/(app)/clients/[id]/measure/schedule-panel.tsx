"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PLATFORMS, measurableAssistants, type Platform } from "@repo/core";
import { api } from "@/trpc/react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";

type Cadence = "daily" | "weekly" | "biweekly";

/**
 * Что можно включить — берётся из каталога, а не пишется здесь ещё раз:
 * новый ассистент появляется в расписании сам, как только для него есть
 * адаптер.
 */
const PLATFORM_OPTIONS = measurableAssistants().map((assistant) => ({
  id: assistant.id as Platform,
  label: assistant.label,
}));

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
  // Запускная тройка включена сразу; остальные — осознанным выбором: у них
  // должен быть ключ на сервере, и каждая добавляет ответы в каждый прогон.
  const [platforms, setPlatforms] = useState<Platform[]>([...DEFAULT_PLATFORMS]);
  const [samples, setSamples] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const saved = schedule.data;

  /**
   * Форма показывает сохранённое расписание, а не умолчания. Без этого клиент
   * с включённым Claude при повторном заходе видел бы галочки запускной
   * тройки, и нажатие «Save» молча выключало бы то, что настроено.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!saved || hydrated) return;
    setCadence(saved.cadence);
    setSamples(saved.samplesPerPrompt);
    setPlatforms(saved.platforms as Platform[]);
    setHydrated(true);
  }, [saved, hydrated]);
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
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {PLATFORM_OPTIONS.map(({ id, label }) => (
              <label key={id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={platforms.includes(id)}
                  onChange={() => togglePlatform(id)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="max-w-prose text-xs text-muted-foreground">
            Every assistant you add asks each prompt again on every run, so it adds to the cost. An
            assistant only answers once its key is set on the server.
          </p>
        </fieldset>

        <button
          type="button"
          disabled={platforms.length === 0 || save.isPending}
          onClick={() =>
            save.mutate({ clientId, cadence, platforms, samplesPerPrompt: samples, active: true })
          }
          className={buttonClass("outline", "lg")}
        >
          {save.isPending ? "Saving…" : "Save schedule"}
        </button>

        <button
          type="button"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate({ clientId })}
          className={buttonClass("primary", "lg")}
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
