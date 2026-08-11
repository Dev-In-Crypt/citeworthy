import { describe, expect, it } from "vitest";
import {
  findFirstNewCitation,
  findVisibilityChange,
  VISIBILITY_CHANGE_THRESHOLD_PP,
} from "./events";
import type { CitationObservation } from "./events";

const ACTION_DATE = new Date("2026-08-31T00:00:00Z");

function observation(domain: string, iso: string): CitationObservation {
  return { domain, observedAt: new Date(iso) };
}

describe("findFirstNewCitation", () => {
  it("находит домен, которого до действия не было", () => {
    const finding = findFirstNewCitation(
      [
        observation("g2.com", "2026-08-20T00:00:00Z"),
        observation("g2.com", "2026-09-05T00:00:00Z"),
        observation("forbes.com", "2026-09-07T00:00:00Z"),
      ],
      ACTION_DATE,
    );

    expect(finding?.domain).toBe("forbes.com");
    expect(finding?.daysAfterAction).toBe(7);
  });

  it("повторная цитата старого домена новой не считается", () => {
    // Иначе «новым» оказывался бы каждый повтор уже известного источника.
    const finding = findFirstNewCitation(
      [
        observation("g2.com", "2026-08-20T00:00:00Z"),
        observation("g2.com", "2026-09-05T00:00:00Z"),
      ],
      ACTION_DATE,
    );

    expect(finding).toBeNull();
  });

  it("возвращает самую раннюю новую цитату, а не любую", () => {
    const finding = findFirstNewCitation(
      [
        observation("later.example", "2026-09-20T00:00:00Z"),
        observation("earlier.example", "2026-09-02T00:00:00Z"),
      ],
      ACTION_DATE,
    );

    expect(finding?.domain).toBe("earlier.example");
  });

  it("цитата в день действия считается «после»", () => {
    const finding = findFirstNewCitation(
      [observation("new.example", "2026-08-31T00:00:00Z")],
      ACTION_DATE,
    );

    expect(finding?.daysAfterAction).toBe(0);
  });

  it("без наблюдений после действия ничего не находит", () => {
    expect(
      findFirstNewCitation([observation("g2.com", "2026-08-01T00:00:00Z")], ACTION_DATE),
    ).toBeNull();
  });

  it("пустой ввод не роняет детект", () => {
    expect(findFirstNewCitation([], ACTION_DATE)).toBeNull();
  });
});

describe("findVisibilityChange", () => {
  it("изменение выше порога становится событием", () => {
    const finding = findVisibilityChange(18, 34);

    expect(finding?.deltaPp).toBe(16);
    expect(finding?.fromPct).toBe(18);
    expect(finding?.toPct).toBe(34);
  });

  it("падение тоже событие", () => {
    // Ухудшение так же важно: агентство должно узнать о нём первым.
    expect(findVisibilityChange(30, 20)?.deltaPp).toBe(-10);
  });

  it("колебание ниже порога событием не становится", () => {
    // Таймлайн, где «что-то произошло» каждую неделю, перестаёт читаться.
    expect(findVisibilityChange(20, 20 + VISIBILITY_CHANGE_THRESHOLD_PP - 1)).toBeNull();
  });

  it("ровно порог засчитывается", () => {
    expect(findVisibilityChange(20, 20 + VISIBILITY_CHANGE_THRESHOLD_PP)).not.toBeNull();
  });

  it("отсутствие baseline не порождает событие", () => {
    expect(findVisibilityChange(null, 40)).toBeNull();
    expect(findVisibilityChange(20, null)).toBeNull();
  });
});
