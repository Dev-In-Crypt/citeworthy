"use client";

import { useEffect } from "react";

/**
 * Ошибки в браузере.
 *
 * Отдельный от сервера SDK и отдельная переменная: DSN клиента уезжает
 * в бандл и по определению публичен, поэтому серверный `SENTRY_DSN` сюда
 * подставлять нельзя. Импорт динамический — без DSN код SDK не грузится вовсе.
 */
export function ClientErrorReporting() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    let cancelled = false;
    void import("@sentry/browser").then((Sentry) => {
      if (cancelled) return;
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0,
        // Ответы моделей и данные клиентов агентства в отчёт об ошибке не уходят.
        sendDefaultPii: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
