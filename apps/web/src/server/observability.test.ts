import { readFile } from "node:fs/promises";
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
  it("цель серверных ошибок — структурный лог", async () => {
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

  it("в каждой записи есть окружение, версия и отпечаток", async () => {
    // Канал остался логом, поэтому у записи должны быть те же опоры, что
    // у события Sentry: по ним её ищут и группируют.
    const { errorReporter } = await import("./observability");
    const { lines, restore } = captureStderr();

    errorReporter.captureError(new Error("run 1 timed out"), { scope: "test" });
    errorReporter.captureError(new Error("run 2 timed out"), { scope: "test" });
    restore();

    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0]).toMatchObject({ service: "web", environment: "test", release: "dev" });
    expect(records[0]!["fingerprint"]).toMatch(/^[0-9a-f]{8}$/);
    expect(records[0]!["fingerprint"]).toBe(records[1]!["fingerprint"]);
  });

  it("секреты и почта в лог не попадают", async () => {
    // Строка лога уезжает в сборщик хостинга — то есть наружу.
    const { errorReporter } = await import("./observability");
    const { lines, restore } = captureStderr();

    errorReporter.captureError(new Error("invite to owner@agency.example failed"), {
      scope: "test",
      authorization: "Bearer abcdefghijklmnop",
      client: { contact: { email: "owner@agency.example" } },
    });
    restore();

    expect(lines[0]).not.toContain("owner@agency.example");
    expect(lines[0]).not.toContain("abcdefghijklmnop");
    expect(JSON.parse(lines[0]!)).toMatchObject({
      authorization: "[redacted]",
      message: "invite to [email] failed",
    });
  });

  it("из заголовков берётся идентификатор запроса и ничего больше", async () => {
    const { onRequestError } = await import("../instrumentation");
    const { lines, restore } = captureStderr();

    await onRequestError?.(
      new Error("render blew up"),
      {
        path: "/clients",
        method: "GET",
        headers: {
          "x-request-id": "req-42",
          cookie: "better-auth.session_token=abc",
          authorization: "Bearer abcdefghijklmnop",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/clients",
        routeType: "render",
        revalidateReason: undefined,
      },
    );
    restore();

    expect(JSON.parse(lines[0]!)).toMatchObject({ scope: "web.request", requestId: "req-42" });
    // Заголовки целиком не уходят: там кука сессии и Authorization.
    expect(lines[0]).not.toContain("better-auth.session_token");
    expect(lines[0]).not.toContain("abcdefghijklmnop");
  });

  it("без известного заголовка идентификатор не выдумывается", async () => {
    const { onRequestError } = await import("../instrumentation");
    const { lines, restore } = captureStderr();

    await onRequestError?.(
      new Error("render blew up"),
      { path: "/clients", method: "GET", headers: { cookie: "x=1" } },
      {
        routerKind: "App Router",
        routePath: "/clients",
        routeType: "render",
        revalidateReason: undefined,
      },
    );
    restore();

    expect(JSON.parse(lines[0]!)).not.toHaveProperty("requestId");
  });

  it("серверная часть не тянет SDK Sentry", async () => {
    // Node-SDK Sentry ронял dev-сервер целиком: сборщик Next пытается
    // забандлить инструментацию загрузки модулей и падает на резолве `path`.
    // Тест держит границу: канал сервера — лог, браузерный SDK живёт отдельно.
    //
    // Проверяется импорт, а не вхождение строки: имя пакета есть в этом самом
    // комментарии, и проверка на подстроку падала бы на собственном объяснении.
    const sdk = "@sentry/" + "node";
    const source = await readFile(new URL("./observability.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(imports).not.toContain(sdk);

    const manifest = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain(sdk);
    expect(Object.keys(manifest.devDependencies ?? {})).not.toContain(sdk);
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
