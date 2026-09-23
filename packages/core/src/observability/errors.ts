import type { Logger } from "./logger";
import { errorFingerprint } from "./reporting";
import { scrubFields, scrubString } from "./scrub";

/**
 * Пере-экспорт соседних модулей наблюдаемости.
 *
 * `packages/core/src/index.ts` принадлежит оркестратору (docs/contracts.md §2)
 * и перечисляет модули поимённо. Чтобы скраббер и общие части отчёта были
 * доступны приложениям как `@repo/core`, они выходят наружу отсюда.
 */
export * from "./reporting";
export * from "./scrub";

/**
 * Приёмник ошибок. В проде — Sentry, в dev и тестах — лог в консоль.
 *
 * Интерфейс живёт здесь, реализация с SDK — в приложениях: core не тянет
 * внешние клиенты (CLAUDE.md, «все внешние API-вызовы за интерфейсами»).
 */

export interface ErrorContext {
  /** Где случилось: `worker.job`, `web.request`. */
  scope: string;
  /** Дополнительные поля. Секретов и сырых ответов моделей здесь быть не должно. */
  [key: string]: unknown;
}

export interface ErrorReporter {
  captureError(error: unknown, context: ErrorContext): void;
}

/** Нормализует что угодно брошенное в пару «имя + сообщение». */
export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "UnknownError", message: String(error) };
}

export interface LoggingErrorReporterOptions {
  /** Вычищать значения перед записью. Выключать только в тестах самого скраббера. */
  scrub?: boolean;
}

/**
 * Консольный транспорт: цель по умолчанию, когда DSN не задан.
 *
 * Отсутствие DSN не должно отключать отчёты об ошибках — иначе в dev ошибка
 * исчезает молча, и о неработающем репортере узнаёшь только в проде.
 *
 * Лог чистится так же, как отправка в Sentry: строка лога уезжает в сборщик
 * хостинга, то есть наружу, и «это всего лишь лог» на секрет не влияет.
 */
export function createLoggingErrorReporter(
  logger: Logger,
  options: LoggingErrorReporterOptions = {},
): ErrorReporter {
  const clean = options.scrub ?? true;

  return {
    captureError(error, context) {
      const described = describeError(error);
      const fields = clean ? scrubFields({ ...context }) : { ...context };

      logger.error("error.captured", {
        ...fields,
        error: described.name,
        message: clean ? scrubString(described.message) : described.message,
        stack:
          described.stack === undefined
            ? undefined
            : clean
              ? scrubString(described.stack)
              : described.stack,
        // По отпечатку одинаковые падения группируются в логе так же,
        // как их сгруппировал бы Sentry.
        fingerprint: errorFingerprint(error, context.scope),
      });
    },
  };
}

/** Отправляет и в Sentry, и в лог: локально ошибку всё равно видно. */
export function combineErrorReporters(...reporters: ErrorReporter[]): ErrorReporter {
  return {
    captureError(error, context) {
      for (const reporter of reporters) {
        reporter.captureError(error, context);
      }
    },
  };
}
