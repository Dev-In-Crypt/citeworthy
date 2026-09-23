import { describe, expect, it } from "vitest";
import { ASSISTANTS } from "./catalogue";
import { isPlatform } from "./registry";
import { PLATFORM_IDS } from "./types";
import {
  SurfaceProviderNotConfiguredError,
  UnconfiguredSerpProvider,
  surfaceCapabilities,
} from "./surfaces";

/**
 * Verify: поверхности, которые мы пока не измеряем.
 *
 * Главное свойство — отрицательное: пока провайдера нет, поверхность не
 * должна отдавать ни одной цифры. Заглушка с правдоподобными ответами попала
 * бы в срезы и стала бы измерением, которого не было.
 */

describe("surfaceCapabilities", () => {
  it("описывает каждую поверхность из каталога", () => {
    expect(surfaceCapabilities()).toHaveLength(ASSISTANTS.length);
  });

  it("у каждой неизмеряемой поверхности сказано, чего именно не хватает", () => {
    for (const surface of surfaceCapabilities().filter((entry) => !entry.measurable)) {
      expect(surface.requirement).not.toBe("none");
      expect(surface.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("поверхности Google требуют поставщика выдачи, а не ключа", () => {
    // Разница не косметическая: ключ — вопрос денег, поставщик выдачи —
    // вопрос того, отдаёт ли Google ответ программно вообще.
    const google = surfaceCapabilities().filter((entry) => entry.id.startsWith("ai-"));

    expect(google.length).toBeGreaterThan(0);
    for (const surface of google) {
      expect(surface.requirement).toBe("serp-provider");
      expect(surface.measurable).toBe(false);
    }
  });

  it("остальная система готова принять поверхность, как только появится провайдер", () => {
    for (const surface of surfaceCapabilities()) {
      expect(surface.pipelineReady).toBe(true);
    }
  });

  it("Copilot тоже ждёт поставщика выдачи, а не ключа", () => {
    // Bing Search API отключён 11.08.2025, а Grounding with Bing — инструмент
    // для своего агента, а не ответ Copilot (см. docs/cost-model.md, §5).
    // Ключ здесь не поможет: поверхность не отдаёт свой ответ программно.
    const copilot = surfaceCapabilities().find((entry) => entry.id === "copilot");

    expect(copilot?.measurable).toBe(false);
    expect(copilot?.requirement).toBe("serp-provider");
  });

  it("неизмеряемую поверхность нельзя поставить в расписание", () => {
    // Самая дешёвая защита от выдуманной цифры: поверхность без адаптера
    // просто не существует для прогонов, очередей и enum в БД.
    const unmeasured = surfaceCapabilities().filter((entry) => !entry.measurable);

    expect(unmeasured.length).toBeGreaterThan(0);
    for (const surface of unmeasured) {
      expect(PLATFORM_IDS as readonly string[]).not.toContain(surface.id);
      expect(isPlatform(surface.id)).toBe(false);
    }
  });

  it("ни одно описание не обещает причинности", () => {
    for (const surface of surfaceCapabilities()) {
      expect(surface.note).not.toMatch(/proof|proven|guarantee|caused/i);
    }
  });
});

describe("UnconfiguredSerpProvider", () => {
  it("отказывается отвечать вместо того, чтобы выдумать ответ", async () => {
    const provider = new UnconfiguredSerpProvider();

    await expect(
      provider.fetchAnswer({ query: "best CRM for startups", surface: "ai-overviews" }),
    ).rejects.toBeInstanceOf(SurfaceProviderNotConfiguredError);
  });
});
