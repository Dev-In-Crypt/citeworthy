import type { AdapterOptions, AdapterResult, Platform, PlatformAdapter } from "./types";
import { fixturesForPlatform } from "../fixtures/responses";

/**
 * FNV-1a: стабильный хэш без зависимостей. Нужен именно детерминизм —
 * один и тот же промпт всегда должен давать один и тот же ответ,
 * иначе тесты пайплайна станут флаки, а visibility в mock-режиме — бессмысленной.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Адаптер поверх fixtures. Сеть не используется никогда.
 * Выбор ответа: сперва точное совпадение промпта, иначе детерминированно по хэшу.
 */
export class MockAdapter implements PlatformAdapter {
  constructor(public readonly platform: Platform) {}

  selectFixture(prompt: string, sampleIndex = 0): AdapterResult {
    const fixtures = fixturesForPlatform(this.platform);

    if (fixtures.length === 0) {
      throw new Error(`No fixtures for platform "${this.platform}"`);
    }

    const normalized = prompt.trim().toLowerCase();

    /**
     * Точные совпадения берутся все, а не первое: у вопроса может быть
     * несколько заготовленных ответов, и повторные сэмплы должны различаться
     * так же, как различаются ответы живого ассистента. Один ответ на все
     * сэмплы давал бы долю только 0% или 100%.
     */
    const exact = fixtures.filter((fixture) => fixture.prompt.toLowerCase() === normalized);
    const pool = exact.length > 0 ? exact : fixtures;

    // Детерминизм сохраняется: та же пара (вопрос, номер сэмпла) всегда
    // даёт тот же ответ, иначе тесты пайплайна станут флаки.
    const index = stableHash(`${normalized}#${sampleIndex}`) % pool.length;
    // Индекс всегда в границах массива, но noUncheckedIndexedAccess требует проверки.
    const picked = pool[index];
    if (!picked) {
      throw new Error(`Fixture selection failed for platform "${this.platform}"`);
    }
    return picked.result;
  }

  execute(prompt: string, opts?: AdapterOptions): Promise<AdapterResult> {
    return Promise.resolve(this.selectFixture(prompt, opts?.sampleIndex ?? 0));
  }
}
