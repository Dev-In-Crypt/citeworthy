import * as Sentry from "@sentry/node";
import {
  combineErrorReporters,
  createLogger,
  createLoggingErrorReporter,
  describeError,
  type ErrorReporter,
  type Logger,
} from "@repo/core";
import { NODE_ENV, SENTRY_DSN } from "./env";

/**
 * Логи и ошибки воркера.
 *
 * Ошибки всегда идут в лог, даже когда настроен Sentry: иначе локальная
 * отладка зависит от внешнего сервиса, а отсутствие DSN тихо выключает
 * единственный канал.
 */

export const logger: Logger = createLogger({
  sink: (line, level) => {
    // stderr для warn/error: в проде их отделяют от обычного потока.
    if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  },
  base: { service: "worker" },
  minLevel: NODE_ENV === "production" ? "info" : "debug",
});

function createSentryReporter(dsn: string): ErrorReporter {
  Sentry.init({ dsn, environment: NODE_ENV, tracesSampleRate: 0 });

  return {
    captureError(error, context) {
      Sentry.captureException(error instanceof Error ? error : new Error(describeError(error).message), {
        tags: { scope: context.scope },
        extra: { ...context },
      });
    },
  };
}

export const errorReporter: ErrorReporter = SENTRY_DSN
  ? combineErrorReporters(createSentryReporter(SENTRY_DSN), createLoggingErrorReporter(logger))
  : createLoggingErrorReporter(logger);

if (!SENTRY_DSN) {
  logger.info("observability.console_only", {
    reason: "SENTRY_DSN is not set; errors go to the log only",
  });
}
