import { describe, expect, it } from "vitest";
import {
  createEventThrottle,
  DEV_RELEASE,
  errorFingerprint,
  eventThrottleKey,
  requestIdFrom,
  resolveDsn,
  resolveEnvironment,
  resolveRelease,
  resolveReporterIdentity,
  sentryBaseOptions,
} from "./reporting";

const DSN = "https://publickey@o0.ingest.example/1";

describe("resolveRelease", () => {
  it("берёт SENTRY_RELEASE как есть", () => {
    expect(resolveRelease({ SENTRY_RELEASE: "2026.09.1" })).toBe("2026.09.1");
  });

  it("сокращает полный sha до семи знаков", () => {
    expect(resolveRelease({ SENTRY_RELEASE: "a".repeat(40) })).toBe("aaaaaaa");
  });

  it("падает на sha коммита от хостинга", () => {
    expect(
      resolveRelease({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567" }),
    ).toBe("0123456");
    expect(resolveRelease({ GIT_COMMIT_SHA: "deadbee" })).toBe("deadbee");
  });

  it("SENTRY_RELEASE важнее sha от хостинга", () => {
    expect(resolveRelease({ SENTRY_RELEASE: "manual", GIT_SHA: "abc1234" })).toBe("manual");
  });

  it("без переменных — dev, а не пустая строка", () => {
    expect(resolveRelease({})).toBe(DEV_RELEASE);
    expect(resolveRelease({ SENTRY_RELEASE: "   " })).toBe(DEV_RELEASE);
  });
});

describe("resolveEnvironment", () => {
  it("SENTRY_ENVIRONMENT важнее NODE_ENV", () => {
    expect(resolveEnvironment({ SENTRY_ENVIRONMENT: "staging", NODE_ENV: "production" })).toBe(
      "staging",
    );
  });

  it("без своей переменной — NODE_ENV", () => {
    expect(resolveEnvironment({ NODE_ENV: "production" })).toBe("production");
  });

  it("без ничего — development", () => {
    expect(resolveEnvironment({})).toBe("development");
  });
});

describe("resolveDsn", () => {
  it("пустая строка и пробелы — это «не настроено»", () => {
    expect(resolveDsn({ SENTRY_DSN: "" })).toBeUndefined();
    expect(resolveDsn({ SENTRY_DSN: "   " })).toBeUndefined();
    expect(resolveDsn({})).toBeUndefined();
  });

  it("читает и своё, и браузерное имя", () => {
    expect(resolveDsn({ SENTRY_DSN: ` ${DSN} ` })).toBe(DSN);
    expect(resolveDsn({ NEXT_PUBLIC_SENTRY_DSN: DSN }, "NEXT_PUBLIC_SENTRY_DSN")).toBe(DSN);
  });
});

describe("sentryBaseOptions", () => {
  it("PII выключен, трассировки нет, версия и окружение проставлены", () => {
    expect(sentryBaseOptions(DSN, { SENTRY_ENVIRONMENT: "staging", SENTRY_RELEASE: "r1" })).toEqual(
      {
        dsn: DSN,
        environment: "staging",
        release: "r1",
        sendDefaultPii: false,
        tracesSampleRate: 0,
        maxBreadcrumbs: 20,
      },
    );
  });

  it("совпадает с resolveReporterIdentity", () => {
    const env = { NODE_ENV: "production", GIT_SHA: "abc1234" };
    const identity = resolveReporterIdentity(env);
    expect(sentryBaseOptions(DSN, env)).toMatchObject(identity);
  });
});

describe("errorFingerprint", () => {
  it("одна и та же ошибка — один отпечаток", () => {
    const first = errorFingerprint(new Error("run 41 failed"), "worker.job");
    const second = errorFingerprint(new Error("run 41 failed"), "worker.job");
    expect(first).toBe(second);
  });

  it("не зависит от изменчивых чисел и идентификаторов в тексте", () => {
    const a = errorFingerprint(new Error("run 41 failed for 9f1c2d3e-0000-4000-8000-000000000001"));
    const b = errorFingerprint(new Error("run 77 failed for 9f1c2d3e-0000-4000-8000-000000000002"));
    expect(a).toBe(b);
  });

  it("разные поломки различаются", () => {
    expect(errorFingerprint(new Error("db is down"))).not.toBe(
      errorFingerprint(new Error("redis is down")),
    );
  });

  it("scope разводит одинаковые сообщения из разных мест", () => {
    expect(errorFingerprint(new Error("timeout"), "worker.job")).not.toBe(
      errorFingerprint(new Error("timeout"), "web.request"),
    );
  });

  it("секрет из сообщения в отпечаток не попадает и не влияет на него", () => {
    const a = errorFingerprint(new Error("auth failed for anna@agency.example"));
    const b = errorFingerprint(new Error("auth failed for boris@agency.example"));
    expect(a).toBe(b);
  });

  it("не падает на том, что не Error", () => {
    expect(errorFingerprint("thrown string")).toMatch(/^[0-9a-f]{8}$/);
    expect(errorFingerprint(undefined)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("createEventThrottle", () => {
  it("пропускает одну ошибку ограниченное число раз", () => {
    const throttle = createEventThrottle({ perKeyLimit: 2, limit: 100, now: () => 0 });

    expect(throttle.accept("a")).toBe(true);
    expect(throttle.accept("a")).toBe(true);
    expect(throttle.accept("a")).toBe(false);
    // Другая ошибка не страдает от соседской лавины.
    expect(throttle.accept("b")).toBe(true);
    expect(throttle.dropped()).toBe(1);
  });

  it("держит общий потолок за окно", () => {
    const throttle = createEventThrottle({ limit: 2, perKeyLimit: 10, now: () => 0 });

    expect(throttle.accept("a")).toBe(true);
    expect(throttle.accept("b")).toBe(true);
    expect(throttle.accept("c")).toBe(false);
  });

  it("новое окно открывает счётчики заново", () => {
    let time = 0;
    const throttle = createEventThrottle({ limit: 1, windowMs: 1000, now: () => time });

    expect(throttle.accept("a")).toBe(true);
    expect(throttle.accept("a")).toBe(false);

    time = 1000;
    expect(throttle.accept("a")).toBe(true);
    expect(throttle.dropped()).toBe(0);
  });
});

describe("eventThrottleKey", () => {
  it("одинаковые исключения дают один ключ", () => {
    const event = (value: string) => ({ exception: { values: [{ type: "Error", value }] } });
    expect(eventThrottleKey(event("run 1 failed"))).toBe(eventThrottleKey(event("run 2 failed")));
  });

  it("событие без исключения группируется по сообщению", () => {
    expect(eventThrottleKey({ message: "boom" })).toBe(eventThrottleKey({ message: "boom" }));
    expect(eventThrottleKey({ message: "boom" })).not.toBe(eventThrottleKey({ message: "other" }));
  });

  it("не падает на пустом событии", () => {
    expect(eventThrottleKey({})).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("requestIdFrom", () => {
  it("берёт первый известный заголовок", () => {
    expect(requestIdFrom({ "x-request-id": "req-1" })).toBe("req-1");
    expect(requestIdFrom({ "cf-ray": "ray-1" })).toBe("ray-1");
  });

  it("работает с объектом Headers", () => {
    const headers = new Headers({ "x-vercel-id": "iad1::abc" });
    expect(requestIdFrom(headers)).toBe("iad1::abc");
  });

  it("из массива значений берёт первое", () => {
    expect(requestIdFrom({ "x-request-id": ["req-1", "req-2"] })).toBe("req-1");
  });

  it("ничего не выдумывает, когда заголовка нет", () => {
    expect(requestIdFrom({ cookie: "session=abc" })).toBeUndefined();
    expect(requestIdFrom({})).toBeUndefined();
    expect(requestIdFrom(undefined)).toBeUndefined();
    expect(requestIdFrom({ "x-request-id": "   " })).toBeUndefined();
  });

  it("обрезает и чистит значение снаружи", () => {
    expect(requestIdFrom({ "x-request-id": "req\n-1" })).toBe("req-1");
    expect(requestIdFrom({ "x-request-id": "r".repeat(500) })).toHaveLength(200);
  });
});
