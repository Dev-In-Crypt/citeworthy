import { describe, expect, it } from "vitest";
import { ClaudeAdapter } from "./claude";
import { GrokAdapter } from "./grok";
import { registerLiveAdapters } from "./live";
import { getAdapter } from "./registry";

/**
 * Подключение живых адаптеров по ключам из окружения. Сети нет: адаптеры лишь
 * создаются, ни один запрос не уходит.
 */

describe("registerLiveAdapters", () => {
  it("без ключей не регистрирует ничего", () => {
    expect(registerLiveAdapters({})).toEqual([]);
  });

  it("пустой или пробельный ключ — это отсутствие ключа", () => {
    expect(registerLiveAdapters({ ANTHROPIC_API_KEY: "  ", XAI_API_KEY: "" })).toEqual([]);
  });

  it("платформа без ключа не регистрируется, остальные — да", () => {
    expect(registerLiveAdapters({ ANTHROPIC_API_KEY: "a" })).toEqual(["claude"]);
    expect(registerLiveAdapters({ XAI_API_KEY: "x" })).toEqual(["grok"]);
  });

  it("измеряемые платформы подключаются своими ключами", () => {
    const registered = registerLiveAdapters({
      OPENAI_API_KEY: "o",
      PERPLEXITY_API_KEY: "p",
      ANTHROPIC_API_KEY: "a",
      XAI_API_KEY: "x",
    });

    expect(registered.sort()).toEqual(["chatgpt", "claude", "grok", "perplexity"]);
  });

  it("Gemini не подключается даже с ключом", () => {
    /**
     * Условия Google запрещают то, ради чего продукт существует. Выключено
     * здесь, а не забытой галочкой в расписании: заданный ключ не должен
     * означать, что вызов возможен.
     */
    const registered = registerLiveAdapters({ GEMINI_API_KEY: "g" });

    expect(registered).toEqual([]);
    expect(() => getAdapter("gemini", "live")).toThrow(/No live adapter/);
  });

  it("зарегистрированные Claude и Grok отдаются реестром в live-режиме", () => {
    registerLiveAdapters({ ANTHROPIC_API_KEY: "a", XAI_API_KEY: "x" });

    expect(getAdapter("claude", "live")).toBeInstanceOf(ClaudeAdapter);
    expect(getAdapter("grok", "live")).toBeInstanceOf(GrokAdapter);
  });

  it("модель без прайса даёт понятную ошибку при создании, а не при первом ответе", () => {
    registerLiveAdapters({ ANTHROPIC_API_KEY: "a", CLAUDE_MODEL: "claude-unpriced" });

    expect(() => getAdapter("claude", "live")).toThrow(/No pricing for Claude model/);
  });

  it("мусор в CLAUDE_MAX_SEARCHES не ломает адаптер: берётся умолчание", () => {
    for (const junk of ["abc", "0", "-2", "1.5"]) {
      registerLiveAdapters({ ANTHROPIC_API_KEY: "a", CLAUDE_MAX_SEARCHES: junk });

      expect(() => getAdapter("claude", "live")).not.toThrow();
    }
  });
});
