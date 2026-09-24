/**
 * Сопоставимость двух периодов по составу измеренных ассистентов.
 *
 * Доля считается как доля от тех ответов, что есть. Значит включённый или
 * выключенный ассистент меняет знаменатель — и все числа вместе с ним, хотя
 * у клиента ничего не произошло. Хуже того, скачок получается крупным, и
 * проверка «отличимо ли это от шума» такой сдвиг подтверждает: два интервала
 * не пересекаются, и продукт говорит «это не случайность». Защита срабатывает
 * задом наперёд — ровно там, где она нужнее всего.
 *
 * Отсюда правило: сравнивать можно только тех ассистентов, которые мерялись
 * в обоих периодах. Здесь только множества и вывод о том, что с ними делать;
 * ни базы, ни интерфейса, ни каталога этот модуль не знает.
 *
 * Работает со строками, а не с `Platform`: это сравнение множеств, и знать
 * каталог ему незачем — значения и так ограничены enum'ом в базе.
 */

export type Comparability =
  /** Наборы совпадают — сравнение честное как есть. */
  | "same"
  /** Из набора только убирали. */
  | "narrowed"
  /** В набор только добавляли. */
  | "widened"
  /** И добавляли, и убирали, но общее осталось: понижение тарифа плюс новый выбор. */
  | "shifted"
  /** Оба набора не пусты, а общего нет вовсе. */
  | "disjoint"
  /** Хотя бы об одном периоде нет записи о том, что в нём мерялось. */
  | "unknown";

export type DeltaAction =
  /** Показать изменение как есть. */
  | "show"
  /** Пересчитать оба конца по общему набору и показать. */
  | "recompute-on-shared"
  /** Изменения нет — сравнивать нечего. */
  | "suppress";

export interface AssistantSetComparison {
  verdict: Comparability;
  /** Наборы и их производные — отсортированы и без повторов: на них строится текст. */
  current: readonly string[];
  previous: readonly string[];
  /** Единственный набор, по которому изменение вправе считаться. */
  shared: readonly string[];
  /** Мерялся сейчас и не мерялся раньше. */
  added: readonly string[];
  /** Мерялся раньше и не мерялся сейчас. */
  dropped: readonly string[];
  delta: DeltaAction;
  /**
   * Можно ли вообще утверждать «это отличимо от шума».
   *
   * После пересчёта по общему набору — можно. Когда общего набора нет,
   * интервалы построены на разных выборках, и их непересечение ничего не
   * говорит о клиенте.
   */
  allowDistinguishability: boolean;
}

function normalise(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))].sort();
}

/**
 * Сравнивает составы двух периодов.
 *
 * Пустой набор — это «нет записи», а не «ничего не менялось»: свести их в
 * `same` значило бы вернуть ту самую ошибку в единственном случае, когда мы
 * действительно ничего не видим.
 */
export function compareAssistantSets(
  current: readonly string[],
  previous: readonly string[],
): AssistantSetComparison {
  const now = normalise(current);
  const before = normalise(previous);

  const shared = now.filter((id) => before.includes(id));
  const added = now.filter((id) => !before.includes(id));
  const dropped = before.filter((id) => !now.includes(id));

  const base = { current: now, previous: before, shared, added, dropped };

  if (now.length === 0 || before.length === 0) {
    return { ...base, verdict: "unknown", delta: "suppress", allowDistinguishability: false };
  }

  if (added.length === 0 && dropped.length === 0) {
    return { ...base, verdict: "same", delta: "show", allowDistinguishability: true };
  }

  if (shared.length === 0) {
    return { ...base, verdict: "disjoint", delta: "suppress", allowDistinguishability: false };
  }

  /**
   * «Сдвинулся» — отдельный случай, а не разновидность сужения.
   *
   * Тариф понизили (ассистент пропал) и в том же окне включили другого:
   * набор не сузился и не расширился. Назвать это сужением значило бы
   * написать в оговорке неправду о том единственном, ради чего оговорка есть.
   */
  const verdict: Comparability =
    added.length === 0 ? "narrowed" : dropped.length === 0 ? "widened" : "shifted";

  return { ...base, verdict, delta: "recompute-on-shared", allowDistinguishability: true };
}

/** Срез по одному ассистенту в том виде, в каком он лежит в недельных срезах. */
export interface AssistantCell {
  assistantId: string;
  sampleCount: number;
  /** Как хранится: проценты с одним знаком после запятой. */
  clientVisibilityPct: number;
}

export interface RestrictedShare {
  /** null — ответов не осталось, показывать нечего. */
  pct: number | null;
  samples: number;
  /** Числитель: нужен, чтобы построить интервал заново. */
  hits: number;
}

/**
 * Доля по части ассистентов, собранная обратно из недельных срезов.
 *
 * Числитель восстанавливается из доли и числа ответов. Это не приближение:
 * доля хранится с одним знаком, а ответов в срезе десятки — ошибка округления
 * заведомо меньше половины ответа, и `Math.round` возвращает то самое целое,
 * из которого долю считали. Благодаря этому пересчёт по общему набору не
 * требует ни новой колонки, ни повторной агрегации сырых ответов.
 */
export function shareOverAssistants(
  cells: readonly AssistantCell[],
  allow: readonly string[],
): RestrictedShare {
  const allowed = new Set(allow);

  let samples = 0;
  let hits = 0;
  for (const cell of cells) {
    if (!allowed.has(cell.assistantId)) continue;
    samples += cell.sampleCount;
    hits += Math.round((cell.clientVisibilityPct / 100) * cell.sampleCount);
  }

  return {
    pct: samples === 0 ? null : Math.round((hits / samples) * 1000) / 10,
    samples,
    hits,
  };
}
