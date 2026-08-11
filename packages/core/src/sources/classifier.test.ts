import { describe, expect, it, vi } from "vitest";
import {
  CachingSourceClassifier,
  classifySource,
  HeuristicSourceClassifier,
} from "./classifier";
import type { SourceClassifier } from "./classifier";
import type { SourceType } from "./domains";

describe("HeuristicSourceClassifier", () => {
  const classifier = new HeuristicSourceClassifier();

  const cases: [string, SourceType][] = [
    ["blog.example.com", "editorial"],
    ["forum.example.com", "ugc"],
    ["community.example.com", "ugc"],
    ["docs.example.io", "documentation"],
    ["best-crm-alternatives.example", "directory"],
  ];

  it.each(cases)("%s -> %s", async (domain, expected) => {
    expect(await classifier.classify(domain)).toBe(expected);
  });

  it("использует заголовок страницы как подсказку", async () => {
    expect(
      await classifier.classify("example.com", { title: "CRM Software Reviews and Ratings" }),
    ).toBe("review");
  });

  it("без подсказок возвращает null, а не выдумывает тип", async () => {
    // Массовая пометка «other» выглядела бы как успешная классификация
    // и тихо портила бы диагностику.
    expect(await classifier.classify("example.com")).toBeNull();
  });
});

describe("CachingSourceClassifier", () => {
  it("повторная встреча домена не вызывает классификатор", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue("editorial") };
    const caching = new CachingSourceClassifier(inner);

    await caching.classify("blog.example.com");
    await caching.classify("blog.example.com");
    await caching.classify("www.Blog.Example.com");

    // Ключевая проверка T31: домен классифицируется один раз — это прямые деньги.
    expect(inner.classify).toHaveBeenCalledTimes(1);
    expect(caching.size).toBe(1);
  });

  it("кэширует и отрицательный ответ", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue(null) };
    const caching = new CachingSourceClassifier(inner);

    await caching.classify("unknown.example");
    await caching.classify("unknown.example");

    // Иначе неизвестные домены опрашивались бы бесконечно при каждом прогоне.
    expect(inner.classify).toHaveBeenCalledTimes(1);
  });

  it("разные домены классифицируются отдельно", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue("ugc") };
    const caching = new CachingSourceClassifier(inner);

    await caching.classify("a.example");
    await caching.classify("b.example");

    expect(inner.classify).toHaveBeenCalledTimes(2);
  });
});

describe("classifySource — порядок", () => {
  it("словарь важнее модели", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue("ugc") };

    const result = await classifySource("g2.com", inner);

    expect(result).toEqual({ type: "review", by: "rule" });
    // Модель даже не спрашивается: известный домен не должен стоить денег.
    expect(inner.classify).not.toHaveBeenCalled();
  });

  it("домен клиента распознаётся правилом до модели", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue("editorial") };

    const result = await classifySource("blog.acmecrm.com", inner, {
      clientDomain: "acmecrm.com",
    });

    expect(result).toEqual({ type: "owned", by: "rule" });
    expect(inner.classify).not.toHaveBeenCalled();
  });

  it("неизвестный домен уходит модели", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue("editorial") };

    const result = await classifySource("some-outlet.example", inner, { title: "Tech news" });

    expect(result).toEqual({ type: "editorial", by: "model" });
    expect(inner.classify).toHaveBeenCalledWith("some-outlet.example", { title: "Tech news" });
  });

  it("модель без уверенности оставляет домен неклассифицированным", async () => {
    const inner: SourceClassifier = { classify: vi.fn().mockResolvedValue(null) };

    expect(await classifySource("mystery.example", inner)).toEqual({ type: null, by: null });
  });
});
