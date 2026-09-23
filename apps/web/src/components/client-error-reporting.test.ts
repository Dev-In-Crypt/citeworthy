import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createBrowserEventFilters, reportingAllowedOnPath } from "./client-error-reporting";

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
        data: { to: "/r/9f2b7c1d4e6a8b3f?token=abc", from: "/clients" },
      }),
    ).toEqual({
      // Токен отчёта — это доступ к отчёту, и лежит он в пути. От перехода
      // остаётся маршрут: видно, что сломалось на отчёте, и не видно, на чьём.
      category: "navigation",
      data: { to: "/r/[redacted]?token=[redacted]", from: "/clients" },
    });

    expect(
      filters.beforeBreadcrumb({
        category: "fetch",
        data: { url: "https://app.example/api?token=abc" },
      }),
    ).toEqual({ category: "fetch", data: { url: "https://app.example/api?token=[redacted]" } });
  });
});

describe("репортер не поднимается на белолейбловом отчёте", () => {
  it("на /r/<токен> инициализация запрещена", () => {
    // Страница, которую агентство отправляет своему клиенту: инвариант 3 —
    // ни следа нашего продукта, инвариант 1 — единственный анонимный вход.
    expect(reportingAllowedOnPath("/r/9f2b7c1d4e6a8b3f")).toBe(false);
    expect(reportingAllowedOnPath("/r/9f2b7c1d4e6a8b3f/")).toBe(false);
    expect(reportingAllowedOnPath("/r")).toBe(false);
    expect(reportingAllowedOnPath("/R/9f2b7c1d4e6a8b3f")).toBe(false);
  });

  it("в приложении агентства инициализация разрешена", () => {
    expect(reportingAllowedOnPath("/")).toBe(true);
    expect(reportingAllowedOnPath("/clients/42")).toBe(true);
    expect(reportingAllowedOnPath("/research")).toBe(true);
    // Свой демонстрационный отчёт — наша страница, а не клиентская.
    expect(reportingAllowedOnPath("/sample-report")).toBe(true);
  });

  it("запрет стоит до загрузки SDK в обоих местах, откуда он поднимается", async () => {
    /**
     * Проверяется исходник: если чанк SDK успеет загрузиться, сторонний код
     * уже на клиентской странице — отказ обязан стоять раньше импорта.
     *
     * Срез берётся от объявления каждой функции, а не от первого слова
     * «useEffect» в файле: первое такое слово — строка импорта из React, и
     * срез от неё захватывал бы объявление `reportingAllowedOnPath`, то
     * есть проверка проходила бы и с вырезанным запретом.
     */
    const source = await readFile(new URL("./client-error-reporting.tsx", import.meta.url), "utf8");

    const entries = {
      // Компонент: поднимает SDK при монтировании на экранах агентства.
      component: source.slice(source.indexOf("export function ClientErrorReporting")),
      // Общий вход: им же пользуется global-error.tsx, где компонента нет.
      starter: source.slice(
        source.indexOf("async function startBrowserReporting"),
        source.indexOf("export async function reportClientError"),
      ),
    };

    for (const [name, body] of Object.entries(entries)) {
      const guard = body.indexOf("reportingAllowedOnPath(window.location.pathname)");
      // Именно загрузка, а не упоминание типа в сигнатуре функции.
      const load = body.search(/(await|void) import\("@sentry\/browser"\)/);

      expect(guard, `${name}: запрет на пути отсутствует`).toBeGreaterThan(-1);
      expect(load, `${name}: загрузка SDK не найдена`).toBeGreaterThan(-1);
      expect(guard, `${name}: запрет стоит после загрузки SDK`).toBeLessThan(load);
      // И в том же условии, где проверяется DSN, а не отдельной веткой ниже.
      expect(body, `${name}: запрет вынесен из условия с DSN`).toMatch(
        /if \(!res(olvedDsn)?[^)]*!reportingAllowedOnPath\(/,
      );
    }
  });

  it("global-error отправляет ошибку общим входом, а не мимо него", async () => {
    /**
     * `global-error.tsx` подменяет корневой layout целиком: перенос
     * репортера в `(app)/layout.tsx` его не закрывает, и прямой вызов
     * `captureException` там был бы и обходом запрета на `/r/*`, и
     * отправкой по неподнятому клиенту — то есть молчанием.
     */
    const source = await readFile(new URL("../app/global-error.tsx", import.meta.url), "utf8");

    expect(source).toContain("void reportClientError(error)");
    expect(source).not.toMatch(/(await|void) import\("@sentry\/browser"\)/);
    expect(source).not.toMatch(/Sentry\.\w+\(/);
  });
});

describe("инициализация браузерного SDK", () => {
  it("без публичного DSN SDK не грузится вовсе", async () => {
    // Проверяется исходник: эффект без DSN должен выйти до динамического
    // импорта, иначе код SDK уедет в бандл каждой страницы.
    const source = await readFile(new URL("./client-error-reporting.tsx", import.meta.url), "utf8");
    // Срез от самого компонента: первое «useEffect» в файле — строка импорта.
    const effect = source.slice(source.indexOf("export function ClientErrorReporting"));

    expect(effect).toContain("process.env.NEXT_PUBLIC_SENTRY_DSN");
    expect(effect.indexOf("if (!resolvedDsn")).toBeLessThan(
      effect.search(/(await|void) import\("@sentry\/browser"\)/),
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
