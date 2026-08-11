import { MockAdapter } from "./mock";
import { PLATFORMS, type Platform, type PlatformAdapter } from "./types";

export type AdaptersMode = "mock" | "live";

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Разбор ADAPTERS_MODE. Значение по умолчанию — mock: случайно уйти в сеть
 * (и в деньги) не должно быть возможно из-за незаданной переменной.
 */
export function parseAdaptersMode(raw: string | undefined): AdaptersMode {
  if (raw === "live") return "live";
  if (raw === undefined || raw === "" || raw === "mock") return "mock";
  throw new Error(`Invalid ADAPTERS_MODE="${raw}". Use "mock" or "live".`);
}

/** Регистр живых адаптеров. Наполняется в T13–T15. */
const liveFactories = new Map<Platform, () => PlatformAdapter>();

export function registerLiveAdapter(platform: Platform, factory: () => PlatformAdapter): void {
  liveFactories.set(platform, factory);
}

export function getAdapter(platform: Platform, mode: AdaptersMode = "mock"): PlatformAdapter {
  if (mode === "mock") {
    return new MockAdapter(platform);
  }

  const factory = liveFactories.get(platform);
  if (!factory) {
    // Понятная ошибка вместо падения где-то в глубине пайплайна.
    throw new Error(
      `No live adapter registered for "${platform}". Set ADAPTERS_MODE=mock, or register it (T13–T15).`,
    );
  }
  return factory();
}

export function getAdapters(platforms: readonly Platform[], mode: AdaptersMode = "mock") {
  return platforms.map((platform) => getAdapter(platform, mode));
}
