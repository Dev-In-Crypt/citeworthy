"use client";

import { useEffect } from "react";
import type * as SentryBrowser from "@sentry/browser";
import {
  createEventThrottle,
  DEV_RELEASE,
  eventThrottleKey,
} from "@repo/core/observability/reporting";
import { scrubEvent } from "@repo/core/observability/scrub";

/**
 * Ошибки в браузере.
 *
 * Отдельный от сервера SDK и отдельная переменная: DSN клиента уезжает
 * в бандл и по определению публичен, поэтому серверный `SENTRY_DSN` сюда
 * подставлять нельзя. Импорт динамический — без DSN код SDK не грузится вовсе.
 *
 * Имя и почта пользователя остаются в браузере: профиль в Sentry не
 * передаётся, `sendDefaultPii` выключен, а всё, что SDK собрал сам, проходит
 * через общий скраббер перед отправкой.
 *
 * Глубокие импорты из core (а не из корня пакета) — чтобы в клиентский бандл
 * не уехал весь барель с адаптерами и схемами.
 */

/** Одна вкладка не может прислать больше этого за минуту. */
const EVENTS_PER_MINUTE = 10;
const SAME_ERROR_PER_MINUTE = 3;

/**
 * Шум браузера, который не говорит ни о чём: расширения, оборванные
 * пользователем запросы, известная безвредная ошибка ResizeObserver.
 * В потоке отчётов он занимает место настоящих поломок.
 */
const IGNORED = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured with value: undefined",
  "AbortError",
  "NetworkError when attempting to fetch resource",
  "Failed to fetch",
  "Load failed",
];

const IGNORED_SOURCES = [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//];

/**
 * Страницы, на которых репортер не поднимается ни при каком DSN.
 *
 * `/r/<токен>` — белолейбловый отчёт, который агентство отправляет своему
 * клиенту. По инварианту 3 там не должно быть ни следа нашего продукта, а
 * публичный DSN — это id нашего проекта в Sentry, и он уезжает в бандл
 * страницы. По инварианту 1 это единственный анонимный вход, и `ReportView`
 * намеренно сделан без интерактива: чем меньше на странице исполняемого кода,
 * тем меньше поводов ей не доверять. Сторонний скрипт поставщика — ровно то,
 * чего здесь быть не должно.
 *
 * Кроме того, в событии отсюда стоял бы `/r/<токен>` — ссылка, дающая доступ
 * к отчёту клиента агентства и к кнопке approve.
 *
 * Проверка живёт в самом компоненте, а не в том, куда его смонтировали:
 * монтаж завтра переедет, а запрет должен остаться где был.
 */
const NO_REPORTING_ROUTES = new Set(["r"]);

/** `/r/abc` → false. Отдельная функция ради теста: браузер для него не нужен. */
export function reportingAllowedOnPath(pathname: string): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const first = path.split("/")[1] ?? "";
  return !NO_REPORTING_ROUTES.has(first.toLowerCase());
}

export interface BrowserEventFilters {
  /** null — событие не отправляется. */
  beforeSend(event: Record<string, unknown>): Record<string, unknown> | null;
  beforeBreadcrumb(breadcrumb: Record<string, unknown>): Record<string, unknown> | null;
}

/**
 * Что уходит из вкладки и что остаётся в ней.
 *
 * Вынесено из эффекта отдельной функцией: правила «почту не отправляем» и
 * «лавину обрываем» проверяются обычным тестом, без браузера и без SDK.
 */
export function createBrowserEventFilters(
  options: { limit?: number; perKeyLimit?: number; windowMs?: number; now?: () => number } = {},
): BrowserEventFilters {
  const throttle = createEventThrottle({
    limit: options.limit ?? EVENTS_PER_MINUTE,
    perKeyLimit: options.perKeyLimit ?? SAME_ERROR_PER_MINUTE,
    windowMs: options.windowMs ?? 60_000,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return {
    beforeSend(event) {
      // Ошибка в цикле рендера повторяется десятки раз в секунду: без потолка
      // одна вкладка забьёт собой весь поток отчётов.
      if (!throttle.accept(eventThrottleKey(event))) return null;
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      /**
       * Клики и вывод в консоль не отправляются: в подписи кнопки стоит имя
       * клиента агентства, а в консоли — что угодно из отладки. Переходы и
       * запросы остаются: по ним видно путь до поломки, а значения параметров
       * вычищает скраббер.
       */
      const category = breadcrumb["category"];
      if (category === "console") return null;
      if (typeof category === "string" && category.startsWith("ui.")) return null;
      return scrubEvent(breadcrumb);
    },
  };
}

/** Повторный монтаж (в частности, StrictMode в dev) не должен инициализировать SDK дважды. */
let started = false;

export interface ClientErrorReportingProps {
  /** По умолчанию — публичная переменная сборки. */
  dsn?: string;
  /**
   * Окружение и версия. В браузере они доступны только через пропсы: серверные
   * `SENTRY_ENVIRONMENT` и `SENTRY_RELEASE` в клиентский бандл не попадают,
   * а заводить для них публичные имена — решение оркестратора
   * (см. docs/open-questions/c-sentry.md).
   */
  environment?: string;
  release?: string;
}

/**
 * Поднимает SDK, если его ещё нет, и отдаёт его.
 *
 * `null` означает «отправлять некуда и не нужно»: нет DSN, либо это
 * страница клиентского отчёта. Проверка пути стоит до динамического
 * импорта — на `/r/*` чанк SDK не должен даже загружаться.
 *
 * Вынесено из эффекта, потому что об этом же просит `global-error.tsx`:
 * он подменяет корневой layout целиком, компонент там не смонтирован, и
 * без общего входа `captureException` оказался бы вызовом по пустому
 * клиенту — молча и без единой ошибки.
 */
async function startBrowserReporting(
  options: ClientErrorReportingProps = {},
): Promise<typeof SentryBrowser | null> {
  const { dsn, environment, release } = options;
  const resolvedDsn = dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!resolvedDsn || !reportingAllowedOnPath(window.location.pathname)) return null;

  const Sentry = await import("@sentry/browser");
  if (started) return Sentry;
  started = true;

  const filters = createBrowserEventFilters();
  Sentry.init({
    dsn: resolvedDsn,
    environment: environment ?? process.env.NODE_ENV ?? "development",
    release: release ?? DEV_RELEASE,
    tracesSampleRate: 0,
    // Ответы моделей и данные клиентов агентства в отчёт об ошибке не уходят.
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    ignoreErrors: IGNORED,
    denyUrls: IGNORED_SOURCES,
    beforeSend: (event) =>
      filters.beforeSend(event as unknown as Record<string, unknown>) as unknown as
        typeof event | null,
    beforeBreadcrumb: (breadcrumb) =>
      filters.beforeBreadcrumb(breadcrumb as unknown as Record<string, unknown>) as unknown as
        typeof breadcrumb | null,
  });

  return Sentry;
}

/**
 * Отправить одну ошибку, подняв SDK, если он ещё не поднят.
 *
 * Для `global-error.tsx`: там нет ни смонтированного компонента, ни
 * гарантии, что до падения успел отработать чей-то эффект.
 */
export async function reportClientError(error: unknown): Promise<void> {
  const Sentry = await startBrowserReporting();
  Sentry?.captureException(error);
}

export function ClientErrorReporting({
  dsn,
  environment,
  release,
}: ClientErrorReportingProps = {}) {
  useEffect(() => {
    const resolvedDsn = dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
    // Проверка пути стоит здесь же, до динамического импорта: на отчёте
    // клиента агентства чанк SDK не должен даже загружаться.
    if (!resolvedDsn || started || !reportingAllowedOnPath(window.location.pathname)) return;
    started = true;

    const filters = createBrowserEventFilters();

    let cancelled = false;
    void import("@sentry/browser").then((Sentry) => {
      if (cancelled) {
        started = false;
        return;
      }

      Sentry.init({
        dsn: resolvedDsn,
        environment: environment ?? process.env.NODE_ENV ?? "development",
        release: release ?? DEV_RELEASE,
        tracesSampleRate: 0,
        // Ответы моделей и данные клиентов агентства в отчёт об ошибке не уходят.
        sendDefaultPii: false,
        maxBreadcrumbs: 20,
        ignoreErrors: IGNORED,
        denyUrls: IGNORED_SOURCES,
        beforeSend: (event) =>
          filters.beforeSend(event as unknown as Record<string, unknown>) as unknown as
            typeof event | null,
        beforeBreadcrumb: (breadcrumb) =>
          filters.beforeBreadcrumb(breadcrumb as unknown as Record<string, unknown>) as unknown as
            typeof breadcrumb | null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [dsn, environment, release]);

  return null;
}
