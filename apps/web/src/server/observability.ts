import * as Sentry from "@sentry/node";
import {
  combineErrorReporters,
  createLogger,
  createLoggingErrorReporter,
  describeError,
  type ErrorReporter,
  type Logger,
} from "@repo/core";

/**
 * Логи и ошибки серверной части web.
 *
 * Инициализация ленивая: модуль подключается из instrumentation.ts, который
 * Next выполняет один раз на процесс, но тот же модуль импортируют роуты.
 * Второй `Sentry.init` был бы тихой заменой клиента, поэтому его нет.
 */

const DSN = process.env.SENTRY_DSN?.trim() || undefined;
const ENVIRONMENT = process.env.NODE_ENV ?? "development";

export const logger: Logger = createLogger({
  sink: (line, level) => {
    if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  },
  base: { service: "web" },
  minLevel: ENVIRONMENT === "production" ? "info" : "debug",
});

let initialised = false;

function sentryReporter(dsn: string): ErrorReporter {
  if (!initialised) {
    Sentry.init({ dsn, environment: ENVIRONMENT, tracesSampleRate: 0 });
    initialised = true;
  }

  return {
    captureError(error, context) {
      Sentry.captureException(
        error instanceof Error ? error : new Error(describeError(error).message),
        { tags: { scope: context.scope }, extra: { ...context } },
      );
    },
  };
}

/**
 * Ошибка всегда попадает в лог; Sentry добавляется, если задан DSN.
 * Без DSN приложение работает — это dev-режим, а не сломанная конфигурация.
 */
export const errorReporter: ErrorReporter = DSN
  ? combineErrorReporters(sentryReporter(DSN), createLoggingErrorReporter(logger))
  : createLoggingErrorReporter(logger);

export const errorReportingTarget = DSN ? "sentry+log" : "log";
