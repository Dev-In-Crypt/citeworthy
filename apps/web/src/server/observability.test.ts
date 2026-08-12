import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Verify T55: брошенное исключение доезжает до транспорта.
 * DSN в тестах не задан, поэтому цель — консольный транспорт (как в dev).
 */

process.env.NEXT_RUNTIME = "nodejs";

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error reporting wiring", () => {
  it("без DSN цель — лог, а не молчание", async () => {
    const { errorReportingTarget } = await import("./observability");
    expect(errorReportingTarget).toBe("log");
  });

  it("captureError пишет структурную строку с scope и сообщением", async () => {
    const { errorReporter } = await import("./observability");
    const { lines, restore } = captureStderr();

    errorReporter.captureError(new Error("test exception"), {
      scope: "test",
      route: "/dashboard",
    });
    restore();

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: "error",
      event: "error.captured",
      service: "web",
      scope: "test",
      route: "/dashboard",
      error: "Error",
      message: "test exception",
    });
    expect(typeof record["time"]).toBe("string");
  });

  it("ошибка запроса Next доезжает до транспорта через onRequestError", async () => {
    const { onRequestError } = await import("../instrumentation");
    const { lines, restore } = captureStderr();

    await onRequestError?.(
      new Error("render blew up"),
      { path: "/clients", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/clients",
        routeType: "render",
        revalidateReason: undefined,
      },
    );
    restore();

    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: "error.captured",
      scope: "web.request",
      path: "/clients",
      method: "GET",
      message: "render blew up",
    });
  });

  it("с DSN ошибка уходит и в Sentry, и в лог", async () => {
    // SDK подменён: проверяется проводка, а не доставка до сервиса —
    // сеть в тестах запрещена (CLAUDE.md).
    const captureException = vi.fn();
    const init = vi.fn();
    vi.doMock("@sentry/node", () => ({ init, captureException }));
    vi.resetModules();
    process.env.SENTRY_DSN = "https://public@o0.ingest.example.com/1";

    try {
      const { errorReporter, errorReportingTarget } = await import("./observability");
      const { lines, restore } = captureStderr();

      errorReporter.captureError(new Error("prod exception"), { scope: "web.request" });
      restore();

      expect(errorReportingTarget).toBe("sentry+log");
      expect(init).toHaveBeenCalledOnce();
      expect(captureException).toHaveBeenCalledOnce();
      expect(captureException.mock.calls[0]?.[1]).toMatchObject({ tags: { scope: "web.request" } });
      // Лог остаётся вторым каналом: локально ошибку всё равно видно.
      expect(JSON.parse(lines[0]!)).toMatchObject({ message: "prod exception" });
    } finally {
      delete process.env.SENTRY_DSN;
      vi.doUnmock("@sentry/node");
      vi.resetModules();
    }
  });

  it("на брошенном не-Error транспорт не падает сам", async () => {
    const { errorReporter } = await import("./observability");
    const { lines, restore } = captureStderr();

    errorReporter.captureError("string thrown from a library", { scope: "test" });
    restore();

    expect(JSON.parse(lines[0]!)).toMatchObject({
      error: "UnknownError",
      message: "string thrown from a library",
    });
  });
});
