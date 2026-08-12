"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/trpc/react";

/**
 * Подтверждение отчёта клиентом агентства. Без регистрации: аккаунт ради
 * одной кнопки — это ровно то, из-за чего клиент не открывает отчёт вовсе.
 */
export function ApproveForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approve = api.publicReport.approve.useMutation({
    onSuccess: () => router.refresh(),
    onError: () => setError("Could not record the approval. Please try again."),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-12">
      <form
        data-testid="approve-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          approve.mutate({ token, name: name.trim() });
        }}
        className="flex flex-wrap items-end gap-3 rounded-lg border p-5"
      >
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Approve this report</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Your name"
            aria-label="Your name"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <button
          type="submit"
          disabled={!name.trim() || approve.isPending}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {approve.isPending ? "Recording…" : "Approve"}
        </button>

        {error && (
          <p role="alert" data-testid="approve-error" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
