import {
  createLogger,
  createLoggingErrorReporter,
  type ErrorReporter,
  type Logger,
} from "@repo/core";

/**
 * Логи и ошибки серверной части web.
 *
 * Здесь намеренно нет SDK Sentry. `@sentry/node` инструментирует загрузку
 * модулей через import-in-the-middle; сборщик Next пытается его забандлить и
 * падает на резолве встроенного `path`, а `serverExternalPackages` не
 * распространяется на слой instrumentation — динамический импорт не спасает.
 * Прод-сборка это переживала, dev-сервер отдавал 500 на каждой странице.
 *
 * Серверные ошибки уходят структурной строкой в stderr: в проде это тот же
 * канал, который собирает хостинг. Ошибки браузера идут в Sentry через
 * `@sentry/browser` (см. components/client-error-reporting.tsx) — там сборка
 * ему не мешает. Полноценный серверный канал вернётся через `@sentry/nextjs`,
 * который для этого и существует.
 */

const ENVIRONMENT = process.env.NODE_ENV ?? "development";

export const logger: Logger = createLogger({
  sink: (line, level) => {
    if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  },
  base: { service: "web" },
  minLevel: ENVIRONMENT === "production" ? "info" : "debug",
});

export const errorReporter: ErrorReporter = createLoggingErrorReporter(logger);

export const errorReportingTarget = "log";
