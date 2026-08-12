import type { Instrumentation } from "next";

/**
 * Точка входа наблюдаемости для web.
 *
 * Импорт динамический и только для nodejs-рантайма: @sentry/node не работает
 * в edge, а грузить его в каждый рантайм ради ветки, которая там не выполнится,
 * незачем.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger, errorReportingTarget } = await import("@/server/observability");
  logger.info("web.started", { errorReporting: errorReportingTarget });
}

/** Серверные ошибки рендера и route handlers. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { errorReporter } = await import("@/server/observability");
  errorReporter.captureError(error, {
    scope: "web.request",
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    renderSource: context.renderSource,
  });
};
