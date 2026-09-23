"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";
import { reportClientError } from "@/components/client-error-reporting";

/**
 * Последний рубеж: ошибка, до которой не добрался ни один локальный boundary.
 *
 * Экран объясняет, что случилось, вместо белой страницы, и отправляет ошибку
 * в Sentry, если клиентский DSN задан. Next требует здесь собственные html/body.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /**
     * Общий вход с обычным репортером: он сам решает, можно ли отправлять
     * (на `/r/*` — нельзя, инвариант 3), и поднимает SDK, если тот ещё не
     * поднят. Этот экран подменяет корневой layout целиком, компонент здесь
     * не смонтирован, а падение могло случиться до первой отрисовки —
     * прямой `captureException` ушёл бы в пустоту.
     */
    void reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-4 px-6">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page failed to load. Your data is untouched — nothing was saved or sent.
          </p>
          {error.digest && (
            <p className="metric text-xs text-muted-foreground">Reference: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className={buttonClass("primary", "lg")}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
