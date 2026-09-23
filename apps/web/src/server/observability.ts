import {
  createLogger,
  createLoggingErrorReporter,
  resolveReporterIdentity,
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
 *
 * Раз канал остаётся логом, он сделан полноценным: у каждой записи те же
 * поля, что были бы у события Sentry, — окружение, версия сборки, отпечаток
 * ошибки и идентификатор запроса. По ним строка ищется и группируется, а при
 * переезде на `@sentry/nextjs` ничего не теряется.
 */

const IDENTITY = resolveReporterIdentity(process.env);

export const { environment: ENVIRONMENT, release: RELEASE } = IDENTITY;

export const logger: Logger = createLogger({
  sink: (line, level) => {
    if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  },
  base: { service: "web", environment: IDENTITY.environment, release: IDENTITY.release },
  // Уровень — по NODE_ENV, а не по имени окружения: `SENTRY_ENVIRONMENT=staging`
  // на боевой сборке не должен включать отладочный поток.
  minLevel: process.env.NODE_ENV === "production" ? "info" : "debug",
});

/** Чистит поля и проставляет отпечаток: см. createLoggingErrorReporter в core. */
export const errorReporter: ErrorReporter = createLoggingErrorReporter(logger);

export const errorReportingTarget = "log";
