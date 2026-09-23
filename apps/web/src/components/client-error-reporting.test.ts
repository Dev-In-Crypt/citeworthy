import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createBrowserEventFilters } from "./client-error-reporting";

/**
 * Что вкладка отправляет в Sentry.
 *
 * Фильтры вынесены из эффекта отдельной функцией именно ради этого теста:
 * правила «почту и имя не отправляем» и «лавину обрываем» проверяются без
 * браузера, без DSN и без сети.
 */

describe("createBrowserEventFilters", () => {
  it("от профиля пользователя остаётся только идентификатор", () => {
    // Имя и почта агентства остаются в браузере: в отчёте об ошибке они
    // не нужны, а уехав однажды, они остаются у внешнего сервиса навсегда.
    const filters = createBrowserEventFilters();

    const event = filters.beforeSend({
      message: "render failed",
      user: { id: "u1", email: "owner@agency.example", username: "Anna Smith" },
    });

    expect(event).toEqual({ message: "render failed", user: { id: "u1" } });
  });

  it("вычищает почту и токены из сообщения и данных", () => {
    const filters = createBrowserEventFilters();

    const event = filters.beforeSend({
      message: "failed to load /r/abc?token=secretvalue for owner@agency.example",
      extra: { apiKey: "abc123def456", client: { contact: { email: "owner@agency.example" } } },
    });

    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain("owner@agency.example");
    expect(serialised).not.toContain("secretvalue");
    expect(serialised).not.toContain("abc123def456");
  });

  it("снимает заголовки и куки запроса целиком", () => {
    const filters = createBrowserEventFilters();

    const event = filters.beforeSend({
      request: {
        url: "https://app.example/clients/1",
        headers: { cookie: "session=abc", "user-agent": "x" },
        cookies: { session: "abc" },
      },
    });

    expect(event).toEqual({ request: { url: "https://app.example/clients/1" } });
  });

  it("обрывает лавину одинаковых ошибок", () => {
    const filters = createBrowserEventFilters({ now: () => 0 });
    const event = () => ({
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    });

    const results = Array.from({ length: 12 }, () => filters.beforeSend(event()));

    expect(results[0]).not.toBeNull();
    expect(results.filter((result) => result !== null).length).toBeLessThanOrEqual(3);
  });

  it("держит общий потолок на вкладку", () => {
    const filters = createBrowserEventFilters({ now: () => 0 });

    const results = Array.from({ length: 40 }, (_unused, index) =>
      filters.beforeSend({ message: `different failure ${String.fromCharCode(97 + index)}` }),
    );

    expect(results.filter((result) => result !== null).length).toBeLessThanOrEqual(10);
  });

  it("клики и вывод в консоль не отправляются", () => {
    const filters = createBrowserEventFilters();

    expect(filters.beforeBreadcrumb({ category: "console", message: "user data here" })).toBeNull();
    expect(
      filters.beforeBreadcrumb({ category: "ui.click", message: "button[Acme Corp]" }),
    ).toBeNull();
    expect(filters.beforeBreadcrumb({ category: "ui.input" })).toBeNull();
  });

  it("переходы остаются, но без значений параметров", () => {
    const filters = createBrowserEventFilters();

    expect(
      filters.beforeBreadcrumb({
        category: "navigation",
        data: { to: "/r/share?token=abc", from: "/clients" },
      }),
    ).toEqual({
      // Токен отчёта — это доступ к отчёту: в навигации от него остаётся имя.
      category: "navigation",
      data: { to: "/r/share?token=[redacted]", from: "/clients" },
    });

    expect(
      filters.beforeBreadcrumb({
        category: "fetch",
        data: { url: "https://app.example/api?token=abc" },
      }),
    ).toEqual({ category: "fetch", data: { url: "https://app.example/api?token=[redacted]" } });
  });
});

describe("инициализация браузерного SDK", () => {
  it("без публичного DSN SDK не грузится вовсе", async () => {
    // Проверяется исходник: эффект без DSN должен выйти до динамического
    // импорта, иначе код SDK уедет в бандл каждой страницы.
    const source = await readFile(new URL("./client-error-reporting.tsx", import.meta.url), "utf8");
    const effect = source.slice(source.indexOf("useEffect"));

    expect(effect).toContain("process.env.NEXT_PUBLIC_SENTRY_DSN");
    expect(effect.indexOf("if (!resolvedDsn")).toBeLessThan(
      effect.indexOf('import("@sentry/browser")'),
    );
    // Серверный DSN публичным не становится ни при каких условиях.
    expect(source).not.toMatch(/process\.env\.SENTRY_DSN/);
  });

  it("PII выключен и трассировки не собираются", async () => {
    const source = await readFile(new URL("./client-error-reporting.tsx", import.meta.url), "utf8");

    expect(source).toContain("sendDefaultPii: false");
    expect(source).toContain("tracesSampleRate: 0");
    // Профиль пользователя в Sentry не передаётся нигде.
    expect(source).not.toContain("setUser");
  });
});
