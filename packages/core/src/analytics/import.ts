import { parseCsvLine } from "../import/csv";
import { classifyReferrer, type TrafficRow } from "./referrers";

/**
 * Разбор выгрузки трафика из аналитики.
 *
 * Формат — то, что отдаёт GA4 в отчёте по источникам: дата, источник,
 * сессии. Строки с непонятным источником не отбрасываются молча: агентство
 * должно видеть, что именно не засчиталось, иначе цифра расходится с его
 * собственной аналитикой без объяснения.
 */

export interface TrafficImportResult {
  rows: TrafficRow[];
  /** Человекочитаемые проблемы с номерами строк. */
  errors: string[];
  /** Источники, которые не относятся ни к одному ассистенту. */
  skippedReferrers: string[];
}

/** Дата в UTC: аналитика приходит в днях, а не в моментах времени. */
function parseDay(value: string): Date | null {
  const trimmed = value.trim();

  // GA4 отдаёт и YYYYMMDD, и YYYY-MM-DD в зависимости от выгрузки.
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const match = compact ?? dashed;
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseTrafficCsv(input: string): TrafficImportResult {
  // BOM в начале выгрузки: его добавляют и Excel, и GA4. Без снятия первая
  // колонка заголовка перестаёт совпадать по имени. Проверка кодом, а не
  // литералом: сам символ в исходнике невидим.
  const withoutBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const text = withoutBom.replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], errors: ["The file is empty."], skippedReferrers: [] };
  }

  const header = parseCsvLine(lines[0] ?? "").map((column) => column.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const sourceIdx = header.findIndex((column) => column === "source" || column === "referrer");
  const sessionsIdx = header.findIndex(
    (column) => column === "sessions" || column === "visits",
  );

  if (dateIdx === -1 || sourceIdx === -1 || sessionsIdx === -1) {
    return {
      rows: [],
      errors: ["Missing header row. Expected columns: date, source, sessions."],
      skippedReferrers: [],
    };
  }

  const rows: TrafficRow[] = [];
  const errors: string[] = [];
  const skipped = new Set<string>();
  // Одна дата и один ассистент могут прийти несколькими строками (разные
  // medium в GA4) — они складываются, а не перетирают друг друга.
  const totals = new Map<string, TrafficRow>();

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const values = parseCsvLine(lines[i] ?? "");

    const day = parseDay(values[dateIdx] ?? "");
    if (!day) {
      errors.push(`Line ${lineNumber}: date is not a date (expected 2026-08-13 or 20260813).`);
      continue;
    }

    const source = (values[sourceIdx] ?? "").trim();
    if (source === "") {
      errors.push(`Line ${lineNumber}: source is empty.`);
      continue;
    }

    const assistant = classifyReferrer(source);
    if (!assistant) {
      skipped.add(source);
      continue;
    }

    const sessions = Number((values[sessionsIdx] ?? "").trim());
    if (!Number.isFinite(sessions) || sessions < 0) {
      errors.push(`Line ${lineNumber}: sessions is not a number.`);
      continue;
    }

    const key = `${day.toISOString()}|${assistant}`;
    const existing = totals.get(key);
    if (existing) {
      existing.sessions += Math.round(sessions);
    } else {
      totals.set(key, { day, assistant, sessions: Math.round(sessions) });
    }
  }

  rows.push(...totals.values());

  return { rows, errors, skippedReferrers: [...skipped] };
}
