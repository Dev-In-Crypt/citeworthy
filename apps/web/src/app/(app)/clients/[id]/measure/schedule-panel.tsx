"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PLATFORMS, type Platform } from "@repo/core";
import { estimateSchedule, type Cadence } from "@repo/core/adapters/capacity";
import { api } from "@/trpc/react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";

function cadenceLabelOf(
  options: { id: string; label: string }[],
  cadence: Cadence,
): string {
  return options.find((option) => option.id === cadence)?.label ?? cadence;
}

export function SchedulePanel({ clientId }: { clientId: string }) {
  const utils = api.useUtils();
  const schedule = api.runs.schedule.useQuery({ clientId });
  const runs = api.runs.list.useQuery({ clientId });
  /**
   * Что тариф разрешает измерять и сколько проверок в месяц он даёт. Форма не
   * знает ни одного тарифа по имени: и список частот, и список ассистентов
   * приходят с сервера — из конфига измерения, а не из литералов здесь.
   */
  const capacity = api.runs.capacity.useQuery({ clientId });

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
      setError(null);
      await utils.runs.schedule.invalidate({ clientId });
    },
    // Отказ тарифа — не молчаливая неудача: сервер объясняет словами, что
    // именно не разрешено, и это должно попасть на экран.
    onError: (e) => setError(e.message),
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

  const options = capacity.data;
  /**
   * Сохранённая частота показывается, даже если тариф её больше не разрешает:
   * подменить выбор молча — значит соврать о том, что настроено. Выбрать её
   * заново нельзя, а при сохранении сервер объяснит отказ.
   */
  const allowedCadences = (options?.cadences ?? []).map((option) => ({
    ...option,
    allowed: true,
  }));
  /**
   * Выбранное сейчас всегда есть в списке: пустой select подменил бы выбор
   * агентства первым попавшимся вариантом. Запрещённым оно помечается только
   * когда ёмкость уже пришла и тариф действительно его не разрешает.
   */
  const cadenceOptions = allowedCadences.some((option) => option.id === cadence)
    ? allowedCadences
    : [...allowedCadences, { id: cadence, label: cadence, allowed: options === undefined }];

  /**
   * То же и с ассистентами: включённый, но больше не разрешённый тарифом
   * остаётся видимым, чтобы его можно было снять. Заново поставить нельзя.
   */
  const allowedAssistants = (options?.assistants ?? []).map((option) => ({
    ...option,
    allowed: true,
  }));
  const assistantOptions = [
    ...allowedAssistants,
    ...platforms
      .filter((id) => !allowedAssistants.some((option) => option.id === id))
      .map((id) => ({ id, label: id, allowed: options === undefined })),
  ];

  const estimate =
    options && platforms.length > 0 && options.promptCount > 0
      ? estimateSchedule({
          plan: options.plan,
          prompts: options.promptCount,
          assistants: platforms.length,
          samplesPerPrompt: samples,
          cadence,
        })
      : null;

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
            {cadenceOptions.map((option) => (
              <option key={option.id} value={option.id} disabled={!option.allowed}>
                {option.label}
              </option>
            ))}
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
            {assistantOptions.map(({ id, label, allowed }) => (
              <label key={id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={platforms.includes(id)}
                  disabled={!allowed && !platforms.includes(id)}
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

      {/*
        Цена выбора — до сохранения, а не в счёте в конце месяца. Всё здесь
        помечено как оценка: число ответов считается точно, а деньги — по
        единственной измеренной цене ответа, и она замерена на ChatGPT, а не
        усреднена по ассистентам (docs/cost-model.md §1). Экран так и говорит:
        обещать среднюю цену данные не позволяют. Настоящая стоимость каждого
        ответа пишется в базу адаптером.
      */}
      {options && (
        <div
          data-testid="schedule-estimate"
          className="flex flex-col gap-1 rounded-md bg-secondary/50 p-3 text-sm"
        >
          {estimate ? (
            <>
              <p>
                <span className="font-medium">Estimated</span>{" "}
                <span className="metric">{estimate.answersPerMonth.toLocaleString("en-US")}</span>{" "}
                answers per month — {options.promptCount} prompts × {platforms.length} assistants ×{" "}
                {samples} samples, {cadenceLabelOf(cadenceOptions, cadence).toLowerCase()}.
              </p>
              <p className={estimate.overAllowance ? "text-destructive" : "text-muted-foreground"}>
                {estimate.overAllowance ? "Above" : "About"}{" "}
                <span className="metric">{Math.round(estimate.ratio * 100)}%</span> of the{" "}
                <span className="metric">{estimate.allowance.toLocaleString("en-US")}</span> checks
                a month this plan includes.
                {estimate.overAllowance
                  ? " Lower the cadence, the samples, or the number of assistants to fit."
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Estimated measurement cost ≈{" "}
                <span className="metric">${estimate.estimatedCostUsd.toFixed(2)}</span> a month. It
                counts every answer at ${options.estimatedCostPerAnswerUsd.toFixed(4)} — a single
                live measurement, taken on ChatGPT. Other assistants cost more or less per answer,
                so read this as a rough figure. What each answer actually costs is recorded per
                answer.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Add prompts and pick at least one assistant to see how many answers a month this
              setting comes to.
            </p>
          )}
        </div>
      )}

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
