"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";
import { reportingAllowedOnPath } from "@/components/client-error-reporting";

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
     * Та же проверка, что и в обычном репортере: этот экран подменяет собой
     * корневой layout целиком, поэтому перенос репортера в `(app)` его не
     * закрывает. Сбой отрисовки на странице клиентского отчёта иначе
     * подтянул бы сторонний скрипт ровно туда, где его быть не должно
     * (инвариант 3), и отправил бы вместе с ним токен доступа в адресе.
     */
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    if (!reportingAllowedOnPath(window.location.pathname)) return;
    void import("@sentry/browser").then((Sentry) => Sentry.captureException(error));
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
