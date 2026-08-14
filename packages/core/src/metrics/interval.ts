/**
 * Интервал вокруг доли и правило «это ещё шум».
 *
 * Ответы ассистентов не воспроизводятся дословно даже при одинаковых
 * настройках, и на выборке в десяток ответов доля гуляет на десятки пунктов
 * сама по себе. Продукт, который показывает «+7 pp» без интервала, продаёт
 * агентству историю успеха, которую нельзя защитить перед его клиентом.
 *
 * Интервал Уилсона, а не нормальное приближение: на малых выборках и у краёв
 * (0% и 100%) нормальное даёт границы за пределами возможного.
 */

export interface ShareInterval {
  /** Доля в процентах. */
  pct: number;
  /** Нижняя и верхняя границы в процентах. */
  low: number;
  high: number;
  /** Полуширина в процентных пунктах — то, что показывают рядом с цифрой. */
  marginPp: number;
}

/** 95% — стандарт де-факто; выносить в настройку нечего. */
const Z = 1.959964;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function wilsonInterval(successes: number, total: number): ShareInterval | null {
  if (total <= 0 || successes < 0 || successes > total) {
    return null;
  }

  const p = successes / total;
  const z2 = Z * Z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const spread =
    (Z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;

  const low = Math.max(0, (centre - spread) * 100);
  const high = Math.min(100, (centre + spread) * 100);

  return {
    pct: round1(p * 100),
    low: round1(low),
    high: round1(high),
    marginPp: round1((high - low) / 2),
  };
}

/**
 * Различимы ли две доли на своих выборках.
 *
 * Пересекающиеся интервалы — это не «изменения нет», а «этой выборкой
 * изменение не различить». Разница между двумя утверждениями и есть разница
 * между отчётом, который клиент может проверить, и обещанием.
 */
export function isDistinguishable(
  current: ShareInterval | null,
  previous: ShareInterval | null,
): boolean {
  if (!current || !previous) {
    return false;
  }
  return current.low > previous.high || current.high < previous.low;
}
