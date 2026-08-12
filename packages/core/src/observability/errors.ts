import type { Logger } from "./logger";

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

/**
 * Консольный транспорт: цель по умолчанию, когда DSN не задан.
 *
 * Отсутствие DSN не должно отключать отчёты об ошибках — иначе в dev ошибка
 * исчезает молча, и о неработающем репортере узнаёшь только в проде.
 */
export function createLoggingErrorReporter(logger: Logger): ErrorReporter {
  return {
    captureError(error, context) {
      const described = describeError(error);
      logger.error("error.captured", {
        ...context,
        error: described.name,
        message: described.message,
        stack: described.stack,
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
