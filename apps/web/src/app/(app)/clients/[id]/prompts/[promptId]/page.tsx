"use client";

import { use } from "react";
import Link from "next/link";
import { highlightMentions } from "@repo/core";
import { api } from "@/trpc/react";
import { EmptyState, PageHeader } from "@/components/page-header";

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

export default function PromptResponsesPage({
  params,
}: {
  params: Promise<{ id: string; promptId: string }>;
}) {
  const { id, promptId } = use(params);
  const data = api.runs.responses.useQuery({ promptId });

  if (data.isPending) {
    return <p className="text-sm text-muted-foreground">Loading answers…</p>;
  }

  if (data.error || !data.data) {
    return <PageHeader title="Prompt not found" description="It may have been removed." />;
  }

  const { prompt, dictionary, responses } = data.data;

  /**
   * Ответ считается «назвал клиента», если подсветка нашла в нём клиента —
   * тем же способом, каким считается доля на дашборде. Второй способ счёта
   * означал бы, что экран и цифра расходятся.
   */
  const mentionsClient = (text: string) =>
    highlightMentions(text, dictionary).some((segment) => segment.kind === "client");
  const namedIn = responses.filter((response) => mentionsClient(response.rawText));

  return (
    <>
      <PageHeader
        title={prompt.text}
        description="Every answer behind the number, exactly as the platform returned it."
        action={
          <Link
            href={`/clients/${id}/measure`}
            className="h-10 rounded-md border border-input px-4 text-sm font-medium leading-10 hover:bg-accent"
          >
            Back to prompts
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-client/20 ring-1 ring-client" />
          client
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-competitor/20 ring-1 ring-competitor" />
          competitors
        </span>
        {/* Сколько ответов и в скольких из них клиент — это и есть та доля,
            которая стоит на дашборде; здесь её можно пересчитать руками. */}
        <span data-testid="named-in" className="metric">
          {responses.length} {responses.length === 1 ? "answer" : "answers"} · named in{" "}
          {namedIn.length}
        </span>
        {prompt.isControl && <span>This is a control prompt.</span>}
      </div>

      {responses.length === 0 ? (
        <EmptyState
          title="No answers yet"
          description="Run a check from the Measure screen. Answers appear here in full, so you can see exactly what the number is built from."
        />
      ) : (
        <ul data-testid="responses-list" className="flex flex-col gap-4">
          {responses.map((response) => (
            <li key={response.id} className="rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {PLATFORM_LABELS[response.platform] ?? response.platform}
                </span>
                <span className="metric">
                  sample {response.sampleIndex + 1} of {responses.length}
                </span>
                <span className="metric">{response.modelVersion}</span>
                <span className="metric">${Number(response.costUsd).toFixed(4)}</span>
                <span className="metric">{new Date(response.createdAt).toLocaleString()}</span>
                {!mentionsClient(response.rawText) && (
                  <span
                    data-testid="not-named"
                    className="rounded-full bg-competitor/12 px-2 py-1 text-[11px] font-medium text-competitor"
                  >
                    not named
                  </span>
                )}
              </div>

              <p
                data-testid="response-text"
                className="whitespace-pre-wrap text-sm leading-relaxed"
              >
                {highlightMentions(response.rawText, dictionary).map((segment, index) =>
                  segment.kind === "plain" ? (
                    <span key={index}>{segment.text}</span>
                  ) : (
                    <mark
                      key={index}
                      data-testid={
                        segment.kind === "client" ? "mention-client" : "mention-competitor"
                      }
                      title={segment.entity}
                      className={
                        segment.kind === "client"
                          ? "rounded bg-client/20 px-0.5 text-foreground"
                          : "rounded bg-competitor/20 px-0.5 text-foreground"
                      }
                    >
                      {segment.text}
                    </mark>
                  ),
                )}
              </p>

              {response.citations.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1 text-sm font-medium">Cited sources</p>
                  <ul data-testid="response-citations" className="flex flex-col gap-1 text-sm">
                    {response.citations.map((citation) => (
                      <li key={citation.id}>
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {citation.title ?? citation.domain}
                        </a>{" "}
                        <span className="text-muted-foreground">{citation.domain}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
