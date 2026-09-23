import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, internalReportUrl, reportPath, reportUrl } from "./report-url";

/**
 * Адреса отчёта собираются из настроек, а не из зашитых строк, и ни одна
 * переменная не обязательна: без них приложение должно работать, а не падать.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reportPath", () => {
  it("даёт путь внутри приложения", () => {
    expect(reportPath("abc123")).toBe("/r/abc123");
  });

  it("экранирует токен: путь не собирается конкатенацией вслепую", () => {
    expect(reportPath("a/b?c")).toBe("/r/a%2Fb%3Fc");
  });
});

describe("appOrigin", () => {
  it("берёт публичный адрес продукта", () => {
    expect(appOrigin({ NEXT_PUBLIC_APP_URL: "https://app.example.test" })).toBe(
      "https://app.example.test",
    );
  });

  it("сносит слэш на конце, чтобы не получилось двойного", () => {
    expect(appOrigin({ NEXT_PUBLIC_APP_URL: "https://app.example.test/" })).toBe(
      "https://app.example.test",
    );
  });

  it("откатывается на адрес аутентификации, если публичного нет", () => {
    expect(appOrigin({ BETTER_AUTH_URL: "https://auth.example.test" })).toBe(
      "https://auth.example.test",
    );
  });

  it("без переменных даёт локальный адрес, а не пустую строку", () => {
    expect(appOrigin({})).toBe("http://localhost:3000");
  });
});

describe("reportUrl", () => {
  it("с доменом агентства ссылка ведёт на него", () => {
    expect(reportUrl("tok", { reportHost: "reports.agency.test" })).toBe(
      "https://reports.agency.test/r/tok",
    );
  });

  it("домен принимается и с протоколом, и со слэшем на конце", () => {
    expect(reportUrl("tok", { reportHost: "https://reports.agency.test/" })).toBe(
      "https://reports.agency.test/r/tok",
    );
  });

  it("без протокола подставляется https: отчёт уходит наружу", () => {
    expect(reportUrl("tok", { reportHost: "reports.agency.test" })).toMatch(/^https:\/\//);
  });

  it("пустая переменная равна отсутствию домена, а не пустому хосту", () => {
    expect(reportUrl("tok", { reportHost: "   ", origin: "https://app.example.test" })).toBe(
      "https://app.example.test/r/tok",
    );
  });

  it("без домена агентства ссылка остаётся на адресе продукта", () => {
    expect(reportUrl("tok", { reportHost: null, origin: "https://app.example.test" })).toBe(
      "https://app.example.test/r/tok",
    );
  });
});

describe("internalReportUrl", () => {
  it("печать PDF ходит по внутреннему адресу", () => {
    expect(internalReportUrl("tok", { INTERNAL_APP_URL: "http://127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000/r/tok",
    );
  });

  it("домен агентства на печать не влияет: изнутри контейнера его может не быть", () => {
    vi.stubEnv("NEXT_PUBLIC_REPORT_HOST", "reports.agency.test");
    expect(internalReportUrl("tok", { INTERNAL_APP_URL: "http://web:3000" })).toBe(
      "http://web:3000/r/tok",
    );
  });

  it("без внутреннего адреса берётся публичный", () => {
    expect(internalReportUrl("tok", { NEXT_PUBLIC_APP_URL: "https://app.example.test" })).toBe(
      "https://app.example.test/r/tok",
    );
  });

  it("без переменных печать идёт на локальный порт, а не падает", () => {
    expect(internalReportUrl("tok", {})).toBe("http://127.0.0.1:3000/r/tok");
  });
});
