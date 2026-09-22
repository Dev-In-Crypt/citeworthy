import { CHECKS_PER_CLIENT_MONTH, PLAN_LIMITS, SAMPLE_HIGHLIGHTS } from "@repo/core";

/**
 * Данные для графиков и карточек витрины.
 *
 * Всё выдумано и так и подписано на страницах («example data»): агентства,
 * клиент, конкуренты, домены в зоне `.example`. Концы рядов при этом совпадают
 * с собранным примером отчёта (`SAMPLE_HIGHLIGHTS`): кнопка «Open the full
 * example» ведёт на него, и цифры на витрине не должны с ним спорить. Имена
 * конкурентов — те же, что в примере отчёта.
 */

export const CLIENT = "Fernpost";

/** Цвета графиков. В SVG-атрибутах var() не работает, поэтому здесь hex — те же значения, что в токенах. */
export const C = {
  client: "#00A63E",
  clientInk: "#008236",
  comp: "#F54900",
  compInk: "#CA3500",
  grid: "#EEECE6",
  base: "#CFCCC2",
  muted: "#5E6572",
  ink2: "#3C414B",
  ink: "#15171C",
} as const;

export const WEEKS = ["W15", "W16", "W17", "W18", "W19", "W20", "W21", "W22", "W23", "W24", "W25", "W26"];

/**
 * Первая и последняя точки клиента — из примера отчёта; промежуточные
 * нарисованы для иллюстрации.
 */
const FERNPOST = [
  SAMPLE_HIGHLIGHTS.deliveryBefore,
  19.9, 20.8, 20.3, 21.9, 22.8, 23.5, 24.9, 25.6, 26.8, 27.4,
  SAMPLE_HIGHLIGHTS.deliveryAfter,
];
const QUILL = [41.2, 41.8, 40.9, 41.5, 42.3, 41.6, 42.0, 41.4, 42.4, 41.9, 42.2, 42.0];
const LOAM = [33.7, 33.2, 33.9, 32.8, 32.9, 32.1, 32.6, 31.8, 31.9, 31.2, 31.6, 31.4];
const TIDE = [22.5, 23.0, 22.4, 23.3, 23.1, 23.9, 23.6, 24.2, 24.0, 24.6, 24.3, 24.8];

/** 216 ответов в неделю: 24 промпта × 3 ассистента × 3 сэмпла. */
export const ANSWERS_PER_WEEK = 24 * 3 * 3;

/** Полуширина 90%-го интервала для доли, оценённой по `n` ответам. */
function halfWidth(pct: number, n: number): number {
  const p = pct / 100;
  return 1.645 * Math.sqrt((p * (1 - p)) / n) * 100;
}

export const FERNPOST_BAND = {
  lo: FERNPOST.map((v) => v - halfWidth(v, ANSWERS_PER_WEEK)),
  hi: FERNPOST.map((v) => v + halfWidth(v, ANSWERS_PER_WEEK)),
};

export type SeriesKind = "client" | "comp" | "control";

export interface Series {
  name: string;
  data: number[];
  kind: SeriesKind;
  opacity?: number;
  strokeWidth?: number;
  markers?: boolean;
}

export const SHARE_SERIES: Series[] = [
  { name: CLIENT, data: FERNPOST, kind: "client" },
  { name: "Quillstack", data: QUILL, kind: "comp" },
  { name: "Loambox", data: LOAM, kind: "comp", opacity: 0.6 },
  { name: "Tidepin", data: TIDE, kind: "comp", opacity: 0.38 },
];

/**
 * Пример эксперимента: темы, которые покрыла работа, против нетронутых тем за
 * те же недели (контракт C5: Δtreatment − Δcontrol). Иллюстрация метода, а не
 * данные из примера отчёта: в квартале примера нетронутых тем не было, и отчёт
 * так и говорит. Поэтому пример лежит в следующем спринте — том, перед которым
 * на доске отмечены контрольные темы (invoicing, time tracking).
 */
export const EXPERIMENT = {
  weeks: ["W22", "W23", "W24", "W25", "W26", "W27", "W28", "W29", "W30", "W31", "W32", "W33"],
  actionWeekIndex: 5,
  treated: [18.8, 19.2, 18.7, 19.1, 19.0, 20.6, 22.1, 23.4, 24.2, 24.9, 25.3, 25.5],
  untouched: [19.6, 20.1, 19.7, 19.9, 19.8, 20.4, 20.9, 21.3, 21.6, 21.9, 22.0, 22.2],
  /** До: W22–W26; после: W30–W33; W27–W29 пропущены, пока модели переобходят страницы. */
  before: [0, 5] as const,
  after: [8, 12] as const,
};

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function periodMean(series: number[], [from, to]: readonly [number, number]): number {
  return Math.round(mean(series.slice(from, to)) * 10) / 10;
}

/* ---------------- источники → бренды (диаграмма потоков) ---------------- */

export const BRANDS = [CLIENT, "Quillstack", "Loambox", "Tidepin"] as const;
export type Brand = (typeof BRANDS)[number];

export const SOURCE_FLOWS: { name: string; sub: string; flows: Record<Brand, number> }[] = [
  { name: "Review platforms", sub: "reviewhub.example +1", flows: { Fernpost: 6, Quillstack: 22, Loambox: 16, Tidepin: 8 } },
  { name: "Comparison articles", sub: "toolreview.example +6", flows: { Fernpost: 9, Quillstack: 14, Loambox: 7, Tidepin: 3 } },
  { name: "Community threads", sub: "forum.example", flows: { Fernpost: 3, Quillstack: 12, Loambox: 9, Tidepin: 4 } },
  { name: "Competitor pages", sub: "quillstack.example +1", flows: { Fernpost: 0, Quillstack: 15, Loambox: 10, Tidepin: 0 } },
  { name: "Fernpost’s own pages", sub: "fernpost.example", flows: { Fernpost: 17, Quillstack: 2, Loambox: 0, Tidepin: 0 } },
];

/* ---------------- промпт × ассистент ---------------- */

export const MATRIX_ASSISTANTS = ["ChatGPT", "Perplexity", "Gemini", "Claude", "Grok"] as const;

/** Число — доля ответов; "floor" — ниже порога сэмплов; null — ассистента не спрашивают. */
export type MatrixCell = number | "floor" | null;

export const MATRIX: { prompt: string; cells: MatrixCell[]; competitorOnly?: boolean[] }[] = [
  { prompt: "best project tool for a small design studio", cells: [44, 33, 22, 33, null] },
  { prompt: "Fernpost vs Quillstack", cells: [89, 100, 78, 89, null] },
  { prompt: "project software with a client portal", cells: [22, 11, 33, 11, null] },
  {
    prompt: "cheapest way to share timelines with clients",
    cells: [0, 0, 11, "floor", null],
    competitorOnly: [true, true, false, false],
  },
  {
    prompt: "how to move a studio off spreadsheets",
    cells: [11, 0, 0, 22, null],
    competitorOnly: [false, true, false, false],
  },
  { prompt: "project tool with time tracking and invoicing", cells: [33, 22, 44, 22, null] },
];

/**
 * Доли конкурентов в примере аудита — те же, что в фикстуре
 * `SAMPLE_AUDIT_REPORT` (в payload отчёта попадает только их среднее).
 */
export const AUDIT_COMPETITORS = [
  { name: "Quillstack", pct: 39.6, opacity: 1 },
  { name: "Loambox", pct: 30.2, opacity: 0.7 },
  { name: "Tidepin", pct: 18.1, opacity: 0.5 },
];

/* ---------------- агентства для белой карточки ---------------- */

export interface ExampleAgency {
  name: string;
  mark: string;
  color: string;
}

/** Выдуманные агентства. Цвета нарочно не индиго: на карточке нет ничего нашего. */
export const AGENCIES: ExampleAgency[] = [
  { name: "Northwind Studio", mark: "N", color: "#1F3A5F" },
  { name: "Harbor & Pine", mark: "H", color: "#8B2F4E" },
];

/* ---------------- тарифы ---------------- */

export type PlanId = "starter" | "growth" | "scale";

/**
 * Типичный расход клиента, округлённый до 50 — так его и называют в тексте.
 * Считается из той же константы, по которой выставлены allowance.
 */
export const TYPICAL_CHECKS_PER_CLIENT = Math.round(CHECKS_PER_CLIENT_MONTH / 50) * 50;

/** С Claude и Grok клиента спрашивают пять ассистентов вместо трёх. */
export const TYPICAL_CHECKS_FIVE_ASSISTANTS = Math.round((TYPICAL_CHECKS_PER_CLIENT * 5) / 3 / 50) * 50;

export const PLANS: {
  id: PlanId;
  name: string;
  audience: string;
  priceUsd: number;
  clientLimit: number;
  aiCheckAllowance: number;
  checksPerClient: number;
  typicalUse: number;
}[] = (["starter", "growth", "scale"] as const).map((id) => {
  const limits = PLAN_LIMITS[id];
  return {
    id,
    name: { starter: "Starter", growth: "Growth", scale: "Scale" }[id],
    audience: {
      starter: "Your first AI Search retainer, or a pilot on existing clients",
      growth: "A delivery line running across a book of clients",
      scale: "AI Search as a standing service across the agency",
    }[id],
    priceUsd: limits.priceUsd,
    clientLimit: limits.clientLimit,
    aiCheckAllowance: limits.aiCheckAllowance,
    checksPerClient: Math.round(limits.aiCheckAllowance / limits.clientLimit / 10) * 10,
    typicalUse: limits.clientLimit * TYPICAL_CHECKS_PER_CLIENT,
  };
});

/* ---------------- форматирование ---------------- */

export const usd = (value: number): string => `$${value.toLocaleString("en-US")}`;
export const int = (value: number): string => value.toLocaleString("en-US");

/** Пункты со знаком и типографским минусом: «+9.2», «−13.4». */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}
