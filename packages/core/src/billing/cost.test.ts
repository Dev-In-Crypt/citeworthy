import { describe, expect, it } from "vitest";
import { formatMicros, formatUsd, parseCostUsd, sumCostUsd } from "./cost";

describe("parseCostUsd", () => {
  const cases: Array<[string, number]> = [
    ["0", 0],
    ["0.000000", 0],
    ["1", 1_000_000],
    ["0.000123", 123],
    ["12.345678", 12_345_678],
    ["-0.5", -500_000],
    [" 2.5 ", 2_500_000],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected} микродолларов`, () => {
      expect(parseCostUsd(input)).toBe(expected);
    });
  }

  it("на нечисловом значении падает, а не считает нулём", () => {
    expect(() => parseCostUsd("free")).toThrow(/numeric/);
    expect(() => parseCostUsd("")).toThrow();
  });
});

describe("sumCostUsd", () => {
  it("складывает без ошибки двоичной дроби", () => {
    // 0.1 + 0.2 в double даёт 0.30000000000000004.
    expect(sumCostUsd(["0.1", "0.2"])).toBe("0.300000");
  });

  it("держит точность на тысяче мелких значений", () => {
    const values = Array.from({ length: 1000 }, () => "0.000123");
    expect(sumCostUsd(values)).toBe("0.123000");
  });

  it("пустой список даёт ноль", () => {
    expect(sumCostUsd([])).toBe("0.000000");
  });

  it("суммирует значения разного масштаба", () => {
    expect(sumCostUsd(["12.5", "0.000001", "0.499999"])).toBe("13.000000");
  });
});

describe("formatMicros", () => {
  it("возвращает строку numeric с шестью знаками", () => {
    expect(formatMicros(1)).toBe("0.000001");
    expect(formatMicros(-2_500_000)).toBe("-2.500000");
  });
});

describe("formatUsd", () => {
  it("обычные суммы — два знака", () => {
    expect(formatUsd("12.345678")).toBe("$12.35");
    expect(formatUsd("0.01")).toBe("$0.01");
  });

  it("копеечные суммы не схлопываются в $0.00", () => {
    expect(formatUsd("0.000123")).toBe("$0.0001");
  });

  it("настоящий ноль показывается как $0.00", () => {
    expect(formatUsd("0")).toBe("$0.00");
  });
});
