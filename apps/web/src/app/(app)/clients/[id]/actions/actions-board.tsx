"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";

const COLUMNS = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
] as const;

type Status = (typeof COLUMNS)[number]["status"] | "dropped";

type ActionRow = {
  id: string;
  title: string;
  reason: string;
  actionType: string;
  estimatedImpact: string;
  effort: string;
  status: string;
  sourceDomain: string | null;
  affectedClusterIds: string[];
  completedAt: Date | null;
  createdAt: Date;
};

const IMPACT_STYLE: Record<string, string> = {
  high: "bg-client/15 text-foreground",
  medium: "bg-secondary text-muted-foreground",
  low: "bg-secondary text-muted-foreground",
};

export function ActionsBoard({ clientId }: { clientId: string }) {
  const utils = api.useUtils();
  const actions = api.actions.list.useQuery({ clientId });

  const [selected, setSelected] = useState<ActionRow | null>(null);
  const [experimentPrompt, setExperimentPrompt] = useState<ActionRow | null>(null);
  const [experimentWarnings, setExperimentWarnings] = useState<string[]>([]);

  const createExperiment = api.experiments.createFromAction.useMutation({
    onSuccess: async (result) => {
      // Предупреждения о слабой базе сравнения показываются сразу, а не прячутся:
      // агентство должно понимать, чего стоит будущая оценка.
      setExperimentWarnings(result.warnings);
      if (result.warnings.length === 0) {
        setExperimentPrompt(null);
      }
      await utils.experiments.list.invalidate({ clientId });
    },
  });

  const update = api.actions.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.actions.list.invalidate({ clientId }),
        utils.actions.activity.invalidate({ clientId }),
      ]);
    },
  });

  function moveTo(action: ActionRow, status: Status): void {
    update.mutate({ id: action.id, status });

    // Завершение действия — момент, когда его ещё можно честно связать
    // с последующим изменением. Позже baseline уже не восстановить.
    if (status === "done" && action.status !== "done") {
      setExperimentPrompt(action);
    }
  }

  if (actions.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const rows = (actions.data ?? []) as ActionRow[];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No actions yet"
        description="Actions come from the Diagnose screen, where each recommendation carries the reason it exists. You can also add one by hand."
      />
    );
  }

  return (
    <>
      <div data-testid="actions-board" className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnRows = rows.filter((row) => row.status === column.status);

          return (
            <section
              key={column.status}
              data-testid={`column-${column.status}`}
              className="flex flex-col gap-2 rounded-lg border bg-secondary/30 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain");
                const dragged = rows.find((row) => row.id === id);
                if (dragged && dragged.status !== column.status) {
                  moveTo(dragged, column.status);
                }
              }}
            >
              <h2 className="flex items-baseline justify-between text-sm font-medium">
                {column.label}
                <span className="metric text-muted-foreground">{columnRows.length}</span>
              </h2>

              {columnRows.map((row) => (
                <article
                  key={row.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", row.id)}
                  className="flex cursor-grab flex-col gap-2 rounded-md border bg-background p-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="text-left text-sm font-medium hover:underline"
                  >
                    {row.title}
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                      {row.actionType.replaceAll("_", " ")}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${IMPACT_STYLE[row.estimatedImpact] ?? ""}`}
                    >
                      impact: {row.estimatedImpact}
                    </span>
                    {row.sourceDomain && (
                      <span className="text-muted-foreground">{row.sourceDomain}</span>
                    )}
                  </div>

                  {/* Кнопки перемещения рядом с drag-and-drop: перетаскивание
                      неудобно на узких экранах и недоступно с клавиатуры. */}
                  <div className="flex gap-1">
                    {COLUMNS.filter((target) => target.status !== row.status).map((target) => (
                      <button
                        key={target.status}
                        type="button"
                        data-testid={`move-${row.id}-${target.status}`}
                        onClick={() => moveTo(row, target.status)}
                        className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        → {target.label}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {selected && (
        <aside
          data-testid="action-drawer"
          className="fixed inset-y-0 right-0 z-20 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-background p-6 shadow-lg"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Why this action exists</span>
            {/* Reason — то, что агентство перескажет клиенту, поэтому он в drawer'е
                на видном месте, а не спрятан в подписи карточки. */}
            <p data-testid="drawer-reason" className="text-sm text-muted-foreground">
              {selected.reason}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd>{selected.actionType.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{selected.status.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estimated impact</dt>
              <dd>{selected.estimatedImpact}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Effort</dt>
              <dd>{selected.effort}</dd>
            </div>
            {selected.sourceDomain && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Source</dt>
                <dd>{selected.sourceDomain}</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="metric">{new Date(selected.createdAt).toLocaleString()}</dd>
            </div>
            {selected.completedAt && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="metric">{new Date(selected.completedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>

          <ActionOutcomePanel actionId={selected.id} />
          <ActionBriefPanel actionId={selected.id} />
        </aside>
      )}

      {experimentPrompt && (
        <div
          data-testid="experiment-dialog"
          role="dialog"
          aria-label="Create experiment"
          className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/20 p-4"
        >
          <div className="flex max-w-md flex-col gap-3 rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-base font-medium">Create an experiment from this action?</h2>
            <p className="text-sm text-muted-foreground">
              Recording the baseline now is what makes it possible to show what changed afterwards.
              Once more weeks pass, the period before the action can no longer be reconstructed.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="create-experiment"
                disabled={createExperiment.isPending}
                onClick={() => createExperiment.mutate({ actionId: experimentPrompt.id })}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {createExperiment.isPending ? "Creating…" : "Create experiment"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setExperimentPrompt(null);
                  setExperimentWarnings([]);
                }}
                className="h-9 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
              >
                {createExperiment.isSuccess ? "Close" : "Not now"}
              </button>
            </div>

            {experimentWarnings.length > 0 && (
              <ul data-testid="experiment-warnings" className="flex flex-col gap-1 text-sm text-muted-foreground">
                {experimentWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Рабочее задание по действию.
 *
 * Загружается отдельным запросом при открытии drawer'а, а не вместе со списком:
 * бриф нужен одному действию из тридцати, и тянуть его на всю доску незачем.
 */
function ActionBriefPanel({ actionId }: { actionId: string }) {
  const brief = api.actions.brief.useQuery({ actionId });

  if (brief.isPending) {
    return <p className="text-sm text-muted-foreground">Loading the brief…</p>;
  }

  if (!brief.data) {
    return null;
  }

  const { objective, context, steps, acceptance, pitfalls } = brief.data;

  return (
    <section data-testid="action-brief" className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">What done looks like</h3>
        <p className="text-sm text-muted-foreground">{objective}</p>
      </div>

      {context.length > 0 && (
        <ul data-testid="brief-context" className="flex flex-col gap-1 text-sm text-muted-foreground">
          {context.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-medium">Steps</h4>
        <ol data-testid="brief-steps" className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-muted-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-medium">Accepted when</h4>
        <ul data-testid="brief-acceptance" className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {acceptance.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-client" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {pitfalls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-sm font-medium">Watch out for</h4>
          <ul data-testid="brief-pitfalls" className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {pitfalls.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Что произошло после работы.
 *
 * Показывается только у закрытых действий с источником: у остальных «после»
 * не с чем сравнивать, и пустой блок был бы обещанием, а не наблюдением.
 */
function ActionOutcomePanel({ actionId }: { actionId: string }) {
  const outcome = api.actions.outcome.useQuery({ actionId });

  if (!outcome.data) {
    return null;
  }

  const { note, firstSeenAt, answersAfter, disclaimer } = outcome.data;

  return (
    <section data-testid="action-outcome" className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="text-sm font-medium">What changed since</h3>
      <p className="text-sm text-muted-foreground">{note}</p>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Answers measured since</dt>
          <dd className="metric font-medium">{answersAfter}</dd>
        </div>
        {firstSeenAt && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">First seen</dt>
            <dd className="metric font-medium">
              {new Date(firstSeenAt).toISOString().slice(0, 10)}
            </dd>
          </div>
        )}
      </dl>

      {/* Совпадение по времени — не причинность, и это сказано рядом с числом. */}
      <p className="text-xs text-muted-foreground">{disclaimer}</p>
    </section>
  );
}
