import { describe, expect, it } from "vitest";
import {
  competitorGapPp,
  computeVisibilitySnapshots,
  endOfIsoWeek,
  MIN_SAMPLES_PER_CELL,
  startOfIsoWeek,
} from "./visibility";
import type { ResponseRecord } from "./visibility";

/** Verify T19: проценты совпадают с посчитанными вручную, пересчёт стабилен. */

const WEEK = new Date("2026-08-12T09:00:00Z"); // среда
const MONDAY = new Date("2026-08-10T00:00:00Z");

function record(overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    responseId: crypto.randomUUID(),
    clusterId: "cluster-a",
    platform: "chatgpt",
    createdAt: WEEK,
    clientMentioned: false,
    competitorsMentioned: [],
    ...overrides,
  };
}

describe("startOfIsoWeek", () => {
  const cases: [string, string][] = [
    ["2026-08-10T00:00:00Z", "2026-08-10T00:00:00.000Z"], // понедельник
    ["2026-08-12T09:00:00Z", "2026-08-10T00:00:00.000Z"], // среда
    ["2026-08-16T23:59:59Z", "2026-08-10T00:00:00.000Z"], // воскресенье
    ["2026-08-17T00:00:00Z", "2026-08-17T00:00:00.000Z"], // следующий понедельник
  ];

  it.each(cases)("%s -> %s", (input, expected) => {
    expect(startOfIsoWeek(new Date(input)).toISOString()).toBe(expected);
  });

  it("воскресенье относится к завершающейся неделе, а не к следующей", () => {
    // Иначе воскресные прогоны отрывались бы от своей недели и портили окно.
    expect(startOfIsoWeek(new Date("2026-08-16T12:00:00Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("окно длится ровно 7 суток", () => {
    expect(endOfIsoWeek(MONDAY).toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });
});

describe("computeVisibilitySnapshots — счёт вручную", () => {
  it("4 из 10 ответов с клиентом дают 40%", () => {
    const records = [
      ...Array.from({ length: 4 }, () => record({ clientMentioned: true })),
      ...Array.from({ length: 6 }, () => record({ clientMentioned: false })),
    ];

    const cell = computeVisibilitySnapshots(records).find(
      (s) => s.clusterId === "cluster-a" && s.platform === "chatgpt",
    );

    expect(cell?.clientVisibilityPct).toBe(40);
    expect(cell?.sampleCount).toBe(10);
  });

  it("доля конкурента считается по ответам, а не по числу упоминаний", () => {
    const records = [
      record({ competitorsMentioned: ["HubSpot", "HubSpot", "HubSpot"] }),
      record({ competitorsMentioned: ["HubSpot"] }),
      record({ competitorsMentioned: [] }),
      record({ competitorsMentioned: [] }),
    ];

    const cell = computeVisibilitySnapshots(records).find((s) => s.platform === "chatgpt");
    // 2 ответа из 4 — 50%, а не 4 из 4 по числу вхождений в текст.
    expect(cell?.competitorVisibility["HubSpot"]).toBe(50);
  });

  it("свёртка по платформам считается по всем ответам", () => {
    const records = [
      record({ platform: "chatgpt", clientMentioned: true }),
      record({ platform: "chatgpt", clientMentioned: false }),
      record({ platform: "gemini", clientMentioned: true }),
      record({ platform: "gemini", clientMentioned: true }),
    ];

    const snapshots = computeVisibilitySnapshots(records);
    const chatgpt = snapshots.find((s) => s.clusterId === "cluster-a" && s.platform === "chatgpt");
    const gemini = snapshots.find((s) => s.clusterId === "cluster-a" && s.platform === "gemini");
    const allPlatforms = snapshots.find(
      (s) => s.clusterId === "cluster-a" && s.platform === null,
    );

    expect(chatgpt?.clientVisibilityPct).toBe(50);
    expect(gemini?.clientVisibilityPct).toBe(100);
    // 3 из 4 = 75%, а не среднее из 50 и 100.
    expect(allPlatforms?.clientVisibilityPct).toBe(75);
  });

  it("свёртка по кластерам и общий итог присутствуют", () => {
    const records = [
      record({ clusterId: "a", clientMentioned: true }),
      record({ clusterId: "b", clientMentioned: false }),
    ];

    const snapshots = computeVisibilitySnapshots(records);
    const total = snapshots.find((s) => s.clusterId === null && s.platform === null);

    expect(total?.clientVisibilityPct).toBe(50);
    expect(total?.sampleCount).toBe(2);
  });

  it("разные недели не смешиваются", () => {
    const records = [
      record({ createdAt: new Date("2026-08-12T09:00:00Z"), clientMentioned: true }),
      record({ createdAt: new Date("2026-08-19T09:00:00Z"), clientMentioned: false }),
    ];

    const weeks = new Set(
      computeVisibilitySnapshots(records).map((s) => s.periodStart.toISOString()),
    );
    expect([...weeks].sort()).toEqual(["2026-08-10T00:00:00.000Z", "2026-08-17T00:00:00.000Z"]);
  });

  it("ячейка с недобором сэмплов помечается как недостаточная", () => {
    const records = Array.from({ length: MIN_SAMPLES_PER_CELL - 1 }, () =>
      record({ clientMentioned: true }),
    );

    const cell = computeVisibilitySnapshots(records).find((s) => s.platform === "chatgpt");
    // Цифра посчитана, но показывать её как измерение нельзя (инвариант 6).
    expect(cell?.clientVisibilityPct).toBe(100);
    expect(cell?.sufficient).toBe(false);
  });

  it("пустой ввод не порождает срезов и не делит на ноль", () => {
    expect(computeVisibilitySnapshots([])).toEqual([]);
  });

  it("пересчёт на тех же данных даёт тот же результат", () => {
    const records = [
      record({ clientMentioned: true, competitorsMentioned: ["HubSpot"] }),
      record({ clientMentioned: false, competitorsMentioned: ["Pipedrive"] }),
      record({ clientMentioned: true }),
    ];

    expect(computeVisibilitySnapshots(records)).toEqual(computeVisibilitySnapshots(records));
  });
});

describe("competitorGapPp", () => {
  it("отрицательное значение означает отставание клиента", () => {
    const [snapshot] = computeVisibilitySnapshots([
      record({ clientMentioned: true, competitorsMentioned: ["HubSpot"] }),
      record({ clientMentioned: false, competitorsMentioned: ["HubSpot"] }),
      record({ clientMentioned: false, competitorsMentioned: ["HubSpot"] }),
      record({ clientMentioned: false, competitorsMentioned: ["HubSpot"] }),
    ]);

    // Клиент 25%, лучший конкурент 100% -> -75 pp.
    expect(competitorGapPp(snapshot!)).toBe(-75);
  });

  it("без конкурентов разрыв равен собственной видимости", () => {
    const [snapshot] = computeVisibilitySnapshots([record({ clientMentioned: true })]);
    expect(competitorGapPp(snapshot!)).toBe(100);
  });
});
