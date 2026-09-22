"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

/**
 * Разовый аудит: одна кнопка — и до диагностики без ручных шагов.
 *
 * Шаги показаны списком, а не одной крутилкой: аудит идёт по чужому клиенту,
 * и человеку, который его запустил, важно видеть, где именно он встал, если
 * встал.
 */

const STEPS = [
  { key: "measure", label: "Asking the assistants", detail: "All three platforms, three samples per prompt" },
  { key: "parse", label: "Reading the answers", detail: "Brand and competitor mentions, cited links" },
  { key: "classify", label: "Classifying the sources", detail: "Which kind of site each citation came from" },
  { key: "aggregate", label: "Working out visibility", detail: "Share of answers, weekly window" },
] as const;

type Phase = "idle" | "running" | "done" | "error";

export function AuditView({ clientId }: { clientId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const prompts = api.prompts.list.useQuery({ clientId });
  const [phase, setPhase] = useState<Phase>("idle");
  /** Прогон, который выполняет воркер (живой режим); null — выполнен сразу. */
  const [queuedRunId, setQueuedRunId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await Promise.all([
      utils.runs.list.invalidate({ clientId }),
      utils.diagnosis.sourceGraph.invalidate({ clientId }),
      utils.measurement.visibility.invalidate({ clientId }),
    ]);
  }

  const audit = api.runs.startAudit.useMutation({
    onMutate: () => setPhase("running"),
    onSuccess: async (result) => {
      /**
       * В живом режиме сервер только создаёт прогон — выполняет его воркер,
       * и это минуты. Раньше экран объявлял «готово» сразу после создания и
       * вёл на пустой список возможностей: аудит, главный путь продажи,
       * выглядел работающим и не делал ничего.
       */
      if (!result.executedInline) {
        setQueuedRunId(result.runId);
        return;
      }
      await refresh();
      setPhase("done");
    },
    onError: () => setPhase("error"),
  });

  const queuedRun = api.runs.get.useQuery(
    { id: queuedRunId ?? "" },
    {
      enabled: queuedRunId !== null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "done" || status === "failed" ? false : 5000;
      },
    },
  );

  useEffect(() => {
    const status = queuedRun.data?.status;
    if (status === "done") {
      void refresh().then(() => setPhase("done"));
    } else if (status === "failed") {
      setPhase("error");
    }
    // Зависимость — только статус: refresh лишь сбрасывает кэш запросов
    // клиента, и перезапускать эффект из-за новой ссылки на него незачем.
  }, [queuedRun.data?.status]);

  // Дойдя до конца, экран сам ведёт к диагностике: аудит не должен
  // заканчиваться вопросом «а дальше куда».
  useEffect(() => {
    if (phase !== "done") return;
    // Аудит ведёт к ранжированной работе, а не к прибору: следующий шаг
    // продажи — «вот что мы нашли и в каком порядке», а не срез по источникам.
    const timer = setTimeout(() => router.push(`/clients/${clientId}/opportunities`), 1200);
    return () => clearTimeout(timer);
  }, [phase, clientId, router]);

  const promptCount = prompts.data?.length ?? 0;

  if (prompts.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (promptCount === 0) {
    return (
      <EmptyState
        title="No prompts to audit yet"
        icon={MessageSquare}
        description="An audit measures the questions buyers actually ask. Generate a starting set on the measure screen, edit it, then come back."
        action={
          <Link
            href={`/clients/${clientId}/measure`}
            className={buttonClass("primary", "lg")}
          >
            Generate prompts
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="run-audit"
          disabled={audit.isPending || phase === "running"}
          onClick={() => audit.mutate({ clientId })}
          className={buttonClass("primary", "lg")}
        >
          {audit.isPending || phase === "running" ? "Running audit…" : "Run audit"}
        </button>
        <span className="text-sm text-muted-foreground">
          <span className="metric">{promptCount}</span> prompts × 3 platforms × 3 samples. Repeated
          samples are what makes the number readable at all — one answer is not a measurement.
        </span>
      </div>

      {phase === "error" && (
        <p role="alert" data-testid="form-error" className="text-sm text-destructive">
          {audit.error?.message ??
            "The audit could not be completed. Some answers did not come back; open the measure screen to see the run and try again."}
        </p>
      )}

      {phase === "running" && queuedRunId !== null && (
        <p data-testid="audit-queued" className="text-sm text-muted-foreground">
          The assistants are being asked now. This takes a few minutes, because every prompt is
          asked several times on each assistant. You can leave this page — the results appear on
          the opportunities screen when the run finishes.
        </p>
      )}

      <ol data-testid="audit-steps" className="flex flex-col gap-2">
        {STEPS.map((step) => {
          const state = phase === "idle" ? "waiting" : phase === "running" ? "running" : "done";
          return (
            <li
              key={step.key}
              data-testid={`audit-step-${step.key}`}
              data-state={state}
              className="flex items-start gap-3 rounded-lg border p-4"
            >
              <span
                aria-hidden
                className={
                  state === "done"
                    ? "mt-1 size-2.5 shrink-0 rounded-full bg-primary"
                    : state === "running"
                      ? "mt-1 size-2.5 shrink-0 animate-pulse rounded-full bg-primary/60"
                      : "mt-1 size-2.5 shrink-0 rounded-full bg-muted-foreground/30"
                }
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{step.label}</span>
                <span className="text-sm text-muted-foreground">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {phase === "done" && (
        <p data-testid="audit-done" className="text-sm">
          Audit complete —{" "}
          <Link
            href={`/clients/${clientId}/opportunities`}
            className="text-primary underline-offset-4 hover:underline"
          >
            open the opportunities
          </Link>
          .
        </p>
      )}
    </div>
  );
}
