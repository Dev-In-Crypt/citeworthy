"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { EmptyState } from "@/components/page-header";

export function ReportsView({ clientId }: { clientId: string }) {
  const utils = api.useUtils();
  const reports = api.reports.list.useQuery({ clientId });
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});

  const generate = api.reports.generate.useMutation({
    onSuccess: async () => {
      await utils.reports.list.invalidate({ clientId });
    },
  });

  const share = api.reports.share.useMutation({
    onSuccess: async (result, variables) => {
      setShareLinks((current) => ({ ...current, [variables.reportId]: result.token }));
      await utils.reports.list.invalidate({ clientId });
    },
  });

  const rows = reports.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="generate-report"
          disabled={generate.isPending}
          onClick={() => generate.mutate({ clientId })}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {generate.isPending ? "Generating…" : "Generate report"}
        </button>
        <span className="text-sm text-muted-foreground">
          Covers the last 30 days. Numbers are frozen at generation time.
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="A report gathers the period's measurements, the work completed and what is planned next, in a page you can send to the client as-is."
        />
      ) : (
        <ul data-testid="reports-list" className="flex flex-col gap-3">
          {rows.map((report) => {
            const token = shareLinks[report.id];

            return (
              <li key={report.id} className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="metric text-sm">
                    {new Date(report.periodStart).toISOString().slice(0, 10)} —{" "}
                    {new Date(report.periodEnd).toISOString().slice(0, 10)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      {report.status}
                    </span>
                    <button
                      type="button"
                      data-testid={`share-${report.id}`}
                      disabled={share.isPending}
                      onClick={() => share.mutate({ reportId: report.id })}
                      className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      Get client link
                    </button>
                  </span>
                </div>

                {token && (
                  <p data-testid="share-link" className="break-all text-sm text-muted-foreground">
                    {/* Ссылка показывается целиком: агентство отправит её сам,
                        автоматической рассылки в продукте нет. */}
                    <a
                      href={`/r/${token}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      /r/{token}
                    </a>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
