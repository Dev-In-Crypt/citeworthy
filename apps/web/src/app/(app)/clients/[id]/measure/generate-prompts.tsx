"use client";

import { useState } from "react";
import { DEFAULT_GENERATED_PROMPT_COUNT, GENERATED_PROMPT_RANGE } from "@repo/core";
import type { GeneratedPrompt } from "@repo/core";
import { api } from "@/trpc/react";

/**
 * Черновик набора промптов для аудита.
 *
 * Список редактируется до сохранения и ничего не пишет в базу сам: предложение
 * генератора — это догадка о том, как спрашивают покупатели, и человек,
 * знающий клиента, правит её быстрее, чем потом читает измерения не по делу.
 */

const inputClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function GeneratePrompts({
  clientId,
  industry,
  onSaved,
}: {
  clientId: string;
  industry: string | null;
  onSaved: () => Promise<void>;
}) {
  const [industryInput, setIndustryInput] = useState(industry ?? "");
  const [count, setCount] = useState(DEFAULT_GENERATED_PROMPT_COUNT);
  const [draft, setDraft] = useState<GeneratedPrompt[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const generate = api.prompts.generate.useMutation({
    onSuccess: (result) => {
      setSummary(null);
      setDraft(result.prompts);
    },
  });

  const save = api.prompts.saveGenerated.useMutation({
    onSuccess: async (result) => {
      setDraft(null);
      setSummary(
        `Saved ${result.createdPrompts} prompts into ${result.createdClusters} new clusters.`,
      );
      await onSaved();
    },
  });

  function editPrompt(index: number, text: string) {
    setDraft((current) =>
      current
        ? current.map((prompt, position) => (position === index ? { ...prompt, text } : prompt))
        : current,
    );
  }

  function removePrompt(index: number) {
    setDraft((current) => current?.filter((_, position) => position !== index) ?? current);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <h2 className="text-base font-medium">Generate buyer prompts</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        A starting set of questions buyers ask in this category. Edit or drop anything that does not
        fit before saving — nothing is measured until you save.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Industry</span>
          <input
            value={industryInput}
            onChange={(event) => setIndustryInput(event.target.value)}
            placeholder="CRM software"
            className={`${inputClass} min-w-56`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">How many</span>
          <input
            type="number"
            min={GENERATED_PROMPT_RANGE.min}
            max={GENERATED_PROMPT_RANGE.max}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className={`${inputClass} w-24`}
          />
        </label>
        <button
          type="button"
          data-testid="generate-prompts"
          disabled={generate.isPending}
          onClick={() =>
            generate.mutate({
              clientId,
              industry: industryInput.trim() || undefined,
              count,
            })
          }
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {generate.isPending ? "Generating…" : "Generate buyer prompts"}
        </button>
      </div>

      {summary && (
        <p data-testid="generate-summary" className="text-sm text-muted-foreground">
          {summary}
        </p>
      )}

      {draft && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <span data-testid="draft-count" className="metric">
              {draft.length}
            </span>{" "}
            prompts proposed. Control prompts are kept untouched by actions, so experiments have
            something to compare against.
          </p>

          <ul data-testid="prompt-draft" className="flex flex-col gap-1.5">
            {draft.map((prompt, index) => (
              <li key={`${prompt.cluster}-${index}`} className="flex items-center gap-2">
                <input
                  value={prompt.text}
                  aria-label={`Prompt ${index + 1}`}
                  onChange={(event) => editPrompt(index, event.target.value)}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
                  {prompt.cluster}
                </span>
                {prompt.isControl && (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    control
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove prompt ${index + 1}`}
                  onClick={() => removePrompt(index)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="save-generated"
              disabled={save.isPending || draft.length === 0}
              onClick={() =>
                save.mutate({
                  clientId,
                  prompts: draft.filter((prompt) => prompt.text.trim().length > 0),
                })
              }
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : `Save ${draft.length} prompts`}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-10 rounded-md border border-input px-3 text-sm font-medium"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
