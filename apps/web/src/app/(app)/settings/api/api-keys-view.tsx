"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Ключи API.
 *
 * Ключ показывается ровно один раз, и об этом сказано до того, как его
 * создали: продукт, который умеет показать его второй раз, хранит секрет
 * в открытом виде.
 */

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/clients", what: "Clients of your agency" },
  {
    method: "GET",
    path: "/api/v1/clients/{id}/visibility",
    what: "Prompt × assistant matrix, intervals, movement",
  },
  { method: "GET", path: "/api/v1/clients/{id}/sources", what: "Cited sources and presence" },
  { method: "GET", path: "/api/v1/clients/{id}/actions", what: "Work queue with reasons" },
  { method: "GET", path: "/api/v1/reports", what: "Reports and their status" },
] as const;

export function ApiKeysView() {
  const utils = api.useUtils();
  const keys = api.apiKeys.list.useQuery();

  const [name, setName] = useState("");
  const [issued, setIssued] = useState<{ prefix: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = api.apiKeys.create.useMutation({
    onSuccess: async (data) => {
      setIssued({ prefix: data.prefix, token: data.token });
      setName("");
      await utils.apiKeys.list.invalidate();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const revoke = api.apiKeys.revoke.useMutation({
    onSuccess: async () => {
      await utils.apiKeys.list.invalidate();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const rows = keys.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-medium">Create a key</h2>
        <p className="text-sm text-muted-foreground">
          The key is shown once, right after it is created. We store only a hash of it, so a
          second look is impossible — keep it somewhere safe or create a new one.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">What is it for</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Looker Studio"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <button
            type="button"
            data-testid="create-api-key"
            disabled={!name || create.isPending}
            onClick={() => {
              setError(null);
              create.mutate({ name });
            }}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Create key
          </button>
        </div>

        {issued && (
          <div
            data-testid="issued-key"
            className="flex flex-col gap-1.5 rounded-md border border-dashed p-3"
          >
            <span className="text-sm font-medium">Copy it now — this is the only time.</span>
            <code className="metric break-all text-sm">{issued.token}</code>
          </div>
        )}

        {error && (
          <p data-testid="form-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Keys</h2>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <table data-testid="api-keys" className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Key</th>
                <th className="py-2 font-medium">Last used</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((key) => (
                <tr key={key.id} className={cn("border-b last:border-0", key.revokedAt && "opacity-50")}>
                  <td className="py-2">{key.name}</td>
                  <td className="metric py-2">cw_live_{key.prefix}…</td>
                  <td className="metric py-2 text-muted-foreground">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "never"}
                  </td>
                  <td className="py-2 text-right">
                    {key.revokedAt ? (
                      <span className="text-muted-foreground">revoked</span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`revoke-${key.id}`}
                        onClick={() => revoke.mutate({ id: key.id })}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Endpoints</h2>
        <p className="text-sm text-muted-foreground">
          Send the key as <code>Authorization: Bearer …</code>. Every figure carries the same
          interval and sample count you see on screen.
        </p>

        <table data-testid="api-endpoints" className="w-full text-sm">
          <tbody>
            {ENDPOINTS.map((endpoint) => (
              <tr key={endpoint.path} className="border-b last:border-0">
                <td className="metric py-2 pr-3 text-muted-foreground">{endpoint.method}</td>
                <td className="metric py-2 pr-3">{endpoint.path}</td>
                <td className="py-2 text-muted-foreground">{endpoint.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
