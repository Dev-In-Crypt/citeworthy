import {
  createPaymentProvider,
  type EventClaim,
  type PaymentEventLedger,
  type PaymentProvider,
} from "@repo/core";
import {
  claimPaymentEvent,
  prunePaymentEvents,
  releasePaymentEvent,
  type Database,
} from "@repo/db";

/**
 * Платёжный провайдер на процесс.
 *
 * Лениво: модуль импортируется страницами, которые денег не касаются, и
 * неполная настройка биллинга не должна ронять сборку — она должна давать
 * понятную ошибку тому, кто нажал «оплатить».
 */
let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  provider ??= createPaymentProvider();
  return provider;
}

/** Подменяется в тестах. */
export function setPaymentProvider(next: PaymentProvider | null): void {
  provider = next;
}

/** Сколько держим отметки о событиях. Stripe повторяет доставку трое суток. */
const RETENTION_DAYS = 30;

/** Чаще раза в час убирать старые отметки незачем. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;

let prunedAt = 0;

/**
 * Журнал обработанных событий вебхука — в базе.
 *
 * Провайдер доставляет событие «хотя бы один раз»: повтор после таймаута
 * или после нашего 500 — штатная работа Stripe. Пока журнал жил в памяти
 * процесса, перезапуск стирал его целиком: событие, применённое минуту
 * назад, после деплоя применялось второй раз — второй раз менялся тариф и
 * второй раз уходило письмо. И второй экземпляр приложения не видел ничего
 * из того, что обработал первый.
 *
 * Занятие события — вставка по первичному ключу: гонку разрешает сама
 * база, а не порядок вызовов в приложении.
 */
export class DbPaymentEventLedger implements PaymentEventLedger {
  constructor(private readonly db: Database) {}

  async claim(eventId: string, occurredAt: Date): Promise<EventClaim> {
    const claimed = await claimPaymentEvent(this.db, eventId, occurredAt);
    if (!claimed) {
      return { claimed: false, reason: "The event was already processed." };
    }

    await this.pruneOccasionally();
    return { claimed: true };
  }

  async release(eventId: string): Promise<void> {
    await releasePaymentEvent(this.db, eventId);
  }

  /**
   * Уборка идёт попутно, а не по расписанию: отдельный планировщик ради
   * удаления нескольких строк в месяц — лишняя движущаяся часть.
   */
  private async pruneOccasionally(): Promise<void> {
    const now = Date.now();
    if (now - prunedAt < PRUNE_EVERY_MS) return;
    prunedAt = now;

    await prunePaymentEvents(this.db, new Date(now - RETENTION_DAYS * 86_400_000));
  }
}

let override: PaymentEventLedger | null = null;

/**
 * Соединение живёт один запрос, поэтому журнал создаётся на запрос, а не
 * на процесс: держать в синглтоне ссылку на закрытое соединение — способ
 * узнать об этом в проде.
 */
export function getPaymentEventLedger(db: Database): PaymentEventLedger {
  return override ?? new DbPaymentEventLedger(db);
}

/** Подменяется в тестах. */
export function setPaymentEventLedger(next: PaymentEventLedger | null): void {
  override = next;
}
