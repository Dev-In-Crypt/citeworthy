/**
 * Структурные логи и отчёты об ошибках.
 *
 * Здесь нет ни Sentry, ни console: core не знает про I/O (см. CLAUDE.md).
 * Формат — чистая функция, транспорт передаётся снаружи. Благодаря этому
 * формат покрыт обычными тестами, а приложения решают, куда писать.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export interface LogRecord {
  level: LogLevel;
  /** Машиночитаемое имя события: `run.started`, `job.failed`. */
  event: string;
  time: string;
  fields: LogFields;
}

/** Значения, которые json-сериализуются предсказуемо. */
function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "bigint") return value.toString();
  return value;
}

/**
 * Одна строка JSON на запись.
 *
 * Логи воркера читают грепом и машиной, а не глазами: разбирать
 * `[worker] started · adapters=mock · ...` через полгода — отдельная работа.
 */
export function formatLogRecord(record: LogRecord): string {
  const payload: Record<string, unknown> = {
    time: record.time,
    level: record.level,
    event: record.event,
  };

  for (const [key, value] of Object.entries(record.fields)) {
    // Поля события не должны затирать служебные ключи.
    if (key === "time" || key === "level" || key === "event") continue;
    if (value === undefined) continue;
    payload[key] = normalise(value);
  }

  return JSON.stringify(payload);
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  /** Куда писать готовую строку. */
  sink: (line: string, level: LogLevel) => void;
  /** Поля, добавляемые в каждую запись (например, `service`). */
  base?: LogFields;
  /** Источник времени: тесты передают фиксированный. */
  now?: () => Date;
  /** Записи ниже этого уровня отбрасываются. */
  minLevel?: LogLevel;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const minRank = LEVEL_RANK[options.minLevel ?? "info"];

  function write(level: LogLevel, event: string, fields: LogFields = {}): void {
    if (LEVEL_RANK[level] < minRank) return;
    options.sink(
      formatLogRecord({
        level,
        event,
        time: now().toISOString(),
        fields: { ...options.base, ...fields },
      }),
      level,
    );
  }

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}
