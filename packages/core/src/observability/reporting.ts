/**
 * Общие части отчёта об ошибке: версия, окружение, отпечаток, ограничитель.
 *
 * Всё чистые функции без I/O — чтобы воркер, сервер web и браузер собирали
 * отчёт одинаково, и чтобы это можно было проверить обычным тестом.
 */

import { scrubString } from "./scrub";

/** Источник переменных: `process.env` в приложении, объект в тесте. */
export type EnvSource = Record<string, string | undefined>;

function read(env: EnvSource, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Версия сборки, с которой пришла ошибка.
 *
 * `SENTRY_RELEASE` задаётся при сборке. Если его нет — берётся короткий sha
 * коммита из переменных, которые подставляет хостинг (свои имена для этого не
 * заводятся, см. docs/contracts.md §3.5). В dev-режиме остаётся `dev`: пустая
 * строка в Sentry означала бы «релиз неизвестен», а `dev` читается однозначно.
 */
export const DEV_RELEASE = "dev";

const COMMIT_ENV_NAMES = [
  "SENTRY_RELEASE",
  "VERCEL_GIT_COMMIT_SHA",
  "RAILWAY_GIT_COMMIT_SHA",
  "GIT_COMMIT_SHA",
  "GIT_SHA",
  "SOURCE_COMMIT",
];

export function resolveRelease(env: EnvSource = {}): string {
  for (const name of COMMIT_ENV_NAMES) {
    const value = read(env, name);
    if (value === undefined) continue;
    // Полный sha читается хуже короткого и ни с чем не сравнивается глазами.
    return /^[0-9a-f]{40}$/i.test(value) ? value.slice(0, 7) : value;
  }
  return DEV_RELEASE;
}

export function resolveEnvironment(env: EnvSource = {}): string {
  return read(env, "SENTRY_ENVIRONMENT") ?? read(env, "NODE_ENV") ?? "development";
}

/**
 * DSN. Пустая строка — это «не настроено», а не «настроено пустым»:
 * в `.env.example` переменная лежит пустой, и без такой нормализации каждый
 * локальный запуск пытался бы инициализировать SDK.
 */
export function resolveDsn(env: EnvSource = {}, name = "SENTRY_DSN"): string | undefined {
  return read(env, name);
}

export interface ReporterIdentity {
  environment: string;
  release: string;
}

export function resolveReporterIdentity(env: EnvSource = {}): ReporterIdentity {
  return { environment: resolveEnvironment(env), release: resolveRelease(env) };
}

/** FNV-1a: короткая стабильная свёртка, криптография тут не нужна. */
function hash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Изменчивые куски сообщения, из-за которых одна и та же поломка выглядит
 * как сотня разных: идентификаторы прогонов, числа, кавычки, адреса.
 */
function normaliseMessage(message: string): string {
  return scrubString(message)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/"[^"]*"|'[^']*'/g, "<str>")
    .replace(/\b\d+\b/g, "<n>")
    .trim()
    .slice(0, 300);
}

/** Первый кадр стека без номеров строк: сдвиг файла не должен плодить группы. */
function topFrame(stack: string | undefined): string {
  if (stack === undefined) return "";
  const line = stack
    .split("\n")
    .slice(1)
    .find((candidate) => candidate.trim().startsWith("at "));
  if (line === undefined) return "";
  return scrubString(line.trim())
    .replace(/:\d+:\d+\)?$/, "")
    .slice(0, 200);
}

/**
 * Отпечаток ошибки: одна поломка — один идентификатор.
 *
 * Нужен и логу, и ограничителю. В логе по нему считают «эта ошибка уже была
 * двести раз», в браузере — отсекают повтор одного и того же исключения из
 * цикла рендера.
 */
export function errorFingerprint(error: unknown, scope?: string): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return hash32([scope ?? "", name, normaliseMessage(message), topFrame(stack)].join("|"));
}

export interface EventThrottleOptions {
  /** Сколько событий всего пропускать за окно. */
  limit?: number;
  /** Сколько раз за окно пропускать одну и ту же ошибку. */
  perKeyLimit?: number;
  windowMs?: number;
  now?: () => number;
}

export interface EventThrottle {
  /** true — можно отправлять. */
  accept(key: string): boolean;
  /** Сколько событий отброшено с начала текущего окна. */
  dropped(): number;
}

/**
 * Ограничитель потока событий.
 *
 * Ошибка в цикле рендера или в обработчике задач выдаёт тысячи одинаковых
 * событий за минуту. Без ограничителя это выжигает квоту Sentry за один
 * инцидент, и следующая — уже другая — ошибка не доедет вообще.
 */
export function createEventThrottle(options: EventThrottleOptions = {}): EventThrottle {
  const limit = options.limit ?? 30;
  const perKeyLimit = options.perKeyLimit ?? 5;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? (() => Date.now());

  let windowStart = now();
  let total = 0;
  let droppedCount = 0;
  let perKey = new Map<string, number>();

  return {
    accept(key) {
      const time = now();
      if (time - windowStart >= windowMs) {
        windowStart = time;
        total = 0;
        droppedCount = 0;
        perKey = new Map();
      }

      const seen = perKey.get(key) ?? 0;
      if (total >= limit || seen >= perKeyLimit) {
        droppedCount++;
        return false;
      }

      total++;
      perKey.set(key, seen + 1);
      return true;
    },
    dropped: () => droppedCount,
  };
}

export interface SentryBaseOptions {
  dsn: string;
  environment: string;
  release: string;
  /** Ни IP, ни куки, ни заголовки: отчёт об ошибке — не аналитика. */
  sendDefaultPii: false;
  /** Трассировка не включена: она платная и для отлова ошибок не нужна. */
  tracesSampleRate: 0;
  maxBreadcrumbs: number;
}

/**
 * Одинаковая часть настроек SDK для воркера и браузера.
 *
 * Держится здесь, чтобы «PII не отправляем» нельзя было забыть в одном из
 * двух мест: забывчивость тут стоит данных клиентов агентства.
 */
export function sentryBaseOptions(dsn: string, env: EnvSource = {}): SentryBaseOptions {
  const identity = resolveReporterIdentity(env);
  return {
    dsn,
    environment: identity.environment,
    release: identity.release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
  };
}

/** Ключ группировки для ограничителя: тип и текст исключения без изменчивого. */
export function eventThrottleKey(event: Record<string, unknown>): string {
  const exception = event["exception"];
  const values =
    exception !== null && typeof exception === "object"
      ? (exception as { values?: unknown }).values
      : undefined;
  const first = Array.isArray(values)
    ? (values[0] as Record<string, unknown> | undefined)
    : undefined;

  const type = typeof first?.["type"] === "string" ? (first["type"] as string) : "";
  const value = typeof first?.["value"] === "string" ? (first["value"] as string) : "";
  const message = typeof event["message"] === "string" ? (event["message"] as string) : "";

  return hash32([type, normaliseMessage(value || message)].join("|"));
}

/** Заголовки в том виде, в каком их отдают Next и node. */
export type HeaderBag =
  Record<string, string | string[] | undefined> | { get(name: string): string | null };

const REQUEST_ID_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-vercel-id",
  "x-amzn-trace-id",
  "cf-ray",
  "fly-request-id",
];

/**
 * Идентификатор запроса — единственное, что берётся из заголовков.
 *
 * Целиком заголовки в отчёт не уходят: там cookie сессии и Authorization.
 * А без идентификатора серверную ошибку не сопоставить со строкой лога
 * балансировщика, и «у клиента не открылась страница» остаётся без следов.
 */
export function requestIdFrom(headers: HeaderBag | undefined): string | undefined {
  if (headers === undefined) return undefined;

  const lookup = (name: string): string | undefined => {
    if (typeof (headers as { get?: unknown }).get === "function") {
      return (headers as { get(key: string): string | null }).get(name) ?? undefined;
    }
    const bag = headers as Record<string, string | string[] | undefined>;
    const value = bag[name] ?? bag[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  for (const name of REQUEST_ID_HEADERS) {
    const value = lookup(name);
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    // Значение приходит снаружи: длину ограничиваем, управляющие символы убираем.
    return trimmed.replace(/[^\x20-\x7e]/g, "").slice(0, 200);
  }

  return undefined;
}
