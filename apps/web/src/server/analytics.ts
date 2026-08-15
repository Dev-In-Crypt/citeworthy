import { createAnalyticsProvider, type AnalyticsProvider } from "@repo/core";

/**
 * Источник аналитики на процесс. Лениво: без доступов он ничего не делает,
 * и ронять из-за него страницы, которые аналитики не касаются, незачем.
 */
let provider: AnalyticsProvider | null = null;

export function getAnalyticsProvider(): AnalyticsProvider {
  provider ??= createAnalyticsProvider();
  return provider;
}

/** Подменяется в тестах. */
export function setAnalyticsProvider(next: AnalyticsProvider | null): void {
  provider = next;
}
