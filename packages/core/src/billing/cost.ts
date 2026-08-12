/**
 * Сложение и показ денег.
 *
 * cost_usd хранится как numeric и приходит строкой. Складывать такие значения
 * через Number — значит копить ошибку двоичной дроби на тысячах ответов,
 * поэтому суммирование идёт в целых микродолларах (6 знаков — точность колонки).
 */

const SCALE = 1_000_000;

/** Строка numeric → целые микродоллары. Бросает на мусоре, а не молча считает 0. */
export function parseCostUsd(value: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a numeric cost value: ${JSON.stringify(value)}`);
  }

  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = trimmed.replace("-", "").split(".");
  const micros =
    Number(whole) * SCALE + Number(fraction.slice(0, 6).padEnd(6, "0").padStart(6, "0"));

  return negative ? -micros : micros;
}

/** Микродоллары → строка numeric без потери знаков. */
export function formatMicros(micros: number): string {
  const negative = micros < 0;
  const absolute = Math.abs(Math.round(micros));
  const whole = Math.floor(absolute / SCALE);
  const fraction = String(absolute % SCALE).padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function sumCostUsd(values: readonly string[]): string {
  return formatMicros(values.reduce((total, value) => total + parseCostUsd(value), 0));
}

/**
 * Для показа: суммы измерений — это доли цента, и `$0.00` скрыл бы разницу
 * между «дёшево» и «ничего не потрачено».
 */
export function formatUsd(value: string): string {
  const micros = parseCostUsd(value);
  const dollars = micros / SCALE;

  if (micros !== 0 && Math.abs(dollars) < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}
