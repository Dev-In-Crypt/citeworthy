import { describe, expect, it } from "vitest";
import { isDistinguishable, wilsonInterval } from "./interval";

/**
 * Verify T95: доля без интервала не подлежит защите перед клиентом, а
 * «рост», чьи интервалы пересекаются, — это не рост.
 */

describe("wilsonInterval", () => {
  it("интервал окружает саму долю", () => {
    const interval = wilsonInterval(3, 12)!;

    expect(interval.pct).toBe(25);
    expect(interval.low).toBeLessThan(25);
    expect(interval.high).toBeGreaterThan(25);
  });

  it("на малой выборке интервал шире, чем на большой", () => {
    const small = wilsonInterval(3, 12)!;
    const large = wilsonInterval(75, 300)!;

    expect(small.marginPp).toBeGreaterThan(large.marginPp);
  });

  it("границы не выходят за пределы возможного даже на краю", () => {
    const none = wilsonInterval(0, 10)!;
    const all = wilsonInterval(10, 10)!;

    expect(none.low).toBe(0);
    expect(none.high).toBeGreaterThan(0);
    expect(all.high).toBe(100);
    expect(all.low).toBeLessThan(100);
  });

  it("без выборки интервала нет", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(5, 3)).toBeNull();
  });
});

describe("isDistinguishable", () => {
  it("пересекающиеся интервалы не считаются изменением", () => {
    // 4/12 против 6/12 — разница 17 пунктов, но выборка её не различает.
    expect(isDistinguishable(wilsonInterval(4, 12), wilsonInterval(6, 12))).toBe(false);
  });

  it("на большой выборке та же разница уже различима", () => {
    expect(isDistinguishable(wilsonInterval(100, 300), wilsonInterval(150, 300))).toBe(true);
  });

  it("отсутствующий интервал не даёт вывода", () => {
    expect(isDistinguishable(wilsonInterval(4, 12), null)).toBe(false);
    expect(isDistinguishable(null, null)).toBe(false);
  });
});
