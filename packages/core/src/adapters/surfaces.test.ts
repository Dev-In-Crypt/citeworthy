import { describe, expect, it } from "vitest";
import { ASSISTANTS } from "./catalogue";
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
