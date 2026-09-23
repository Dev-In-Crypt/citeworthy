import { describe, expect, it } from "vitest";
import type { AdapterResult } from "@repo/core";
import {
  DEFAULT_PROMPT,
  EXIT_FAILED,
  EXIT_OK,
  EXIT_REFUSED,
  redactKey,
  runGeminiCheck,
  type CheckEnv,
  type CheckGeminiIo,
} from "../../../../../scripts/check-gemini";

/**
 * Проверка живого скрипта — на моке: сеть в тестах не трогается никогда.
 * Здесь важны ровно две вещи. Скрипт не должен уходить в сеть, когда его об
 * этом не просили (не тот режим, нет ключа, непонятные аргументы), и не должен
 * печатать ключ.
 *
 * Тест лежит здесь, а не рядом со скриптом: `scripts/` не входит ни в один
 * пакет, и его некому запускать. Запрос на отдельное место — в open-questions.
 */

const KEY = "AIza-test-key-not-a-real-one";

const RESULT: AdapterResult = {
  text: "Fernpost and Quillstack are the usual suggestions for small studios.",
  citations: [
    { url: "https://reviewhub.example/best-tools" },
    { url: "https://reviewhub.example/another-page" },
    { url: "https://forum.example/thread/1" },
  ],
  modelVersion: "gemini-3.6-flash-001",
  costUsd: 0.0247,
  latencyMs: 4312,
};

function harness(
  overrides: {
    env?: CheckEnv;
    args?: readonly string[];
    execute?: (prompt: string) => Promise<AdapterResult>;
  } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];

  const io: CheckGeminiIo = {
    env: overrides.env ?? { ADAPTERS_MODE: "live", GEMINI_API_KEY: KEY },
    args: overrides.args ?? [],
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    createAdapter: () => ({
      execute: (prompt: string) => {
        prompts.push(prompt);
        return overrides.execute ? overrides.execute(prompt) : Promise.resolve(RESULT);
      },
    }),
  };

  return { io, out, err, prompts };
}

describe("живая проверка Gemini", () => {
  it("в mock-режиме не делает запроса и выходит с ненулевым кодом", async () => {
    const { io, err, prompts } = harness({ env: { GEMINI_API_KEY: KEY } });

    expect(await runGeminiCheck(io)).toBe(EXIT_REFUSED);
    expect(prompts).toEqual([]);
    expect(err.join("\n")).toContain("ADAPTERS_MODE=live");
  });

  it("при ADAPTERS_MODE=live без ключа объясняет, чего не хватает", async () => {
    const { io, err, prompts } = harness({ env: { ADAPTERS_MODE: "live" } });

    expect(await runGeminiCheck(io)).toBe(EXIT_REFUSED);
    expect(prompts).toEqual([]);
    expect(err.join("\n")).toContain("GEMINI_API_KEY");
  });

  it("непонятный режим — отказ, а не падение", async () => {
    const { io, err } = harness({ env: { ADAPTERS_MODE: "nearly-live", GEMINI_API_KEY: KEY } });

    expect(await runGeminiCheck(io)).toBe(EXIT_REFUSED);
    expect(err.join("\n")).toContain("ADAPTERS_MODE");
  });

  it("делает ровно один запрос и печатает вопрос по умолчанию", async () => {
    const { io, out, prompts } = harness();

    expect(await runGeminiCheck(io)).toBe(EXIT_OK);
    expect(prompts).toEqual([DEFAULT_PROMPT]);
    expect(out.join("\n")).toContain(DEFAULT_PROMPT);
  });

  it("берёт вопрос из аргумента", async () => {
    const { io, prompts } = harness({ args: ["best CRM for startups"] });

    expect(await runGeminiCheck(io)).toBe(EXIT_OK);
    expect(prompts).toEqual(["best CRM for startups"]);
  });

  it("печатает версию модели, цену, задержку, число цитат и домены", async () => {
    const { io, out } = harness();

    expect(await runGeminiCheck(io)).toBe(EXIT_OK);
    const text = out.join("\n");

    expect(text).toContain("gemini-3.6-flash-001");
    expect(text).toContain("$0.024700");
    expect(text).toContain("4312 ms");
    // Три цитаты на двух доменах: домены схлопываются, число — нет.
    expect(text).toMatch(/citations\s+3/);
    expect(text).toContain("reviewhub.example, forum.example");
  });

  it("никогда не печатает ключ", async () => {
    const { io, out, err } = harness();

    await runGeminiCheck(io);
    expect([...out, ...err].join("\n")).not.toContain(KEY);
  });

  it("упавший запрос — ненулевой код и читаемая строка без ключа", async () => {
    const { io, out, err } = harness({
      execute: () => Promise.reject(new Error(`Gemini responded 401: bad key ${KEY}`)),
    });

    expect(await runGeminiCheck(io)).toBe(EXIT_FAILED);
    const text = [...out, ...err].join("\n");
    expect(text).toContain("The Gemini request failed");
    expect(text).not.toContain(KEY);
    expect(text).toContain("[redacted]");
  });

  it("лишние аргументы и неизвестные флаги — отказ до запроса", async () => {
    const many = harness({ args: ["one", "two"] });
    expect(await runGeminiCheck(many.io)).toBe(EXIT_REFUSED);
    expect(many.prompts).toEqual([]);

    const flag = harness({ args: ["--live"] });
    expect(await runGeminiCheck(flag.io)).toBe(EXIT_REFUSED);
    expect(flag.prompts).toEqual([]);

    const empty = harness({ args: ["  "] });
    expect(await runGeminiCheck(empty.io)).toBe(EXIT_REFUSED);
    expect(empty.prompts).toEqual([]);
  });

  it("--help печатает способ запуска, ничего не спрашивая у сети", async () => {
    const { io, out, prompts } = harness({ args: ["--help"], env: {} });

    expect(await runGeminiCheck(io)).toBe(EXIT_OK);
    expect(prompts).toEqual([]);
    expect(out.join("\n")).toContain("ADAPTERS_MODE=live");
  });

  it("ответ без цитат не считается нормой и отмечается", async () => {
    const { io, out } = harness({
      execute: () => Promise.resolve({ ...RESULT, citations: [] }),
    });

    expect(await runGeminiCheck(io)).toBe(EXIT_OK);
    expect(out.join("\n")).toContain("No sources cited");
  });

  it("redactKey не трогает строку, когда ключа нет", () => {
    expect(redactKey("plain text", undefined)).toBe("plain text");
    expect(redactKey(`before ${KEY} after`, KEY)).toBe("before [redacted] after");
  });
});
