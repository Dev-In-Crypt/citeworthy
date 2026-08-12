import { describe, expect, it } from "vitest";
import { createLogger, formatLogRecord, type LogLevel } from "./logger";
import { combineErrorReporters, createLoggingErrorReporter, describeError } from "./errors";

const FIXED = new Date("2026-08-12T10:00:00.000Z");

function collectingLogger(base?: Record<string, unknown>, minLevel?: LogLevel) {
  const lines: string[] = [];
  const logger = createLogger({
    sink: (line) => lines.push(line),
    base,
    now: () => FIXED,
    minLevel,
  });
  return { lines, logger, parsed: () => lines.map((line) => JSON.parse(line)) };
}

describe("formatLogRecord", () => {
  const cases: Array<{ name: string; fields: Record<string, unknown>; expected: unknown }> = [
    {
      name: "простые поля",
      fields: { runId: "r1", platform: "chatgpt" },
      expected: { runId: "r1", platform: "chatgpt" },
    },
    {
      name: "даты сериализуются в ISO",
      fields: { at: new Date("2026-01-02T03:04:05.000Z") },
      expected: { at: "2026-01-02T03:04:05.000Z" },
    },
    {
      name: "ошибка разворачивается в имя и сообщение",
      fields: { cause: new TypeError("bad input") },
      expected: { cause: { name: "TypeError", message: "bad input" } },
    },
    {
      name: "undefined опускается",
      fields: { present: 1, missing: undefined },
      expected: { present: 1 },
    },
    {
      name: "служебные ключи не перетираются полями события",
      fields: { level: "debug", event: "spoofed", time: "yesterday" },
      expected: {},
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const line = formatLogRecord({
        level: "info",
        event: "run.started",
        time: FIXED.toISOString(),
        fields: testCase.fields,
      });

      expect(JSON.parse(line)).toEqual({
        time: FIXED.toISOString(),
        level: "info",
        event: "run.started",
        ...(testCase.expected as Record<string, unknown>),
      });
    });
  }

  it("даёт ровно одну строку — формат разбирается построчно", () => {
    const line = formatLogRecord({
      level: "error",
      event: "job.failed",
      time: FIXED.toISOString(),
      fields: { message: "line one\nline two" },
    });

    expect(line.split("\n")).toHaveLength(1);
  });
});

describe("createLogger", () => {
  it("добавляет базовые поля в каждую запись", () => {
    const { logger, parsed } = collectingLogger({ service: "worker" });

    logger.info("worker.started", { queues: 3 });
    logger.error("job.failed", { jobId: "7" });

    expect(parsed()).toEqual([
      {
        time: FIXED.toISOString(),
        level: "info",
        event: "worker.started",
        service: "worker",
        queues: 3,
      },
      {
        time: FIXED.toISOString(),
        level: "error",
        event: "job.failed",
        service: "worker",
        jobId: "7",
      },
    ]);
  });

  it("отбрасывает записи ниже минимального уровня", () => {
    const { logger, lines } = collectingLogger(undefined, "warn");

    logger.debug("noisy");
    logger.info("also.noisy");
    logger.warn("kept");
    logger.error("kept.too");

    expect(lines).toHaveLength(2);
  });

  it("передаёт уровень в транспорт — stdout и stderr разводятся снаружи", () => {
    const seen: LogLevel[] = [];
    const logger = createLogger({ sink: (_line, level) => seen.push(level), now: () => FIXED });

    logger.info("a");
    logger.error("b");

    expect(seen).toEqual(["info", "error"]);
  });
});

describe("describeError", () => {
  it("разбирает Error", () => {
    const described = describeError(new RangeError("out of range"));
    expect(described.name).toBe("RangeError");
    expect(described.message).toBe("out of range");
  });

  it("не падает на том, что не Error", () => {
    expect(describeError("just a string")).toMatchObject({
      name: "UnknownError",
      message: "just a string",
    });
    expect(describeError(undefined).message).toBe("undefined");
  });
});

describe("error reporter", () => {
  it("консольный репортер пишет ошибку в лог со scope", () => {
    const { logger, parsed } = collectingLogger({ service: "web" });
    const reporter = createLoggingErrorReporter(logger);

    reporter.captureError(new Error("boom"), { scope: "web.request", route: "/dashboard" });

    const [record] = parsed();
    expect(record).toMatchObject({
      level: "error",
      event: "error.captured",
      service: "web",
      scope: "web.request",
      route: "/dashboard",
      error: "Error",
      message: "boom",
    });
  });

  it("составной репортер отдаёт ошибку каждому приёмнику", () => {
    const seen: string[] = [];
    const spy = (name: string) => ({
      captureError: () => {
        seen.push(name);
      },
    });

    combineErrorReporters(spy("sentry"), spy("console")).captureError(new Error("x"), {
      scope: "worker.job",
    });

    expect(seen).toEqual(["sentry", "console"]);
  });
});
