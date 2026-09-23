import {
  createPaymentProvider,
  InMemoryPaymentEventLedger,
  type PaymentEventLedger,
  type PaymentProvider,
} from "@repo/core";

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

/**
 * Журнал обработанных событий вебхука.
 *
 * В памяти — потому что честного умолчания без новой таблицы нет, а
 * таблицы заводит оркестратор (запрос лежит в
 * `docs/open-questions/a-stripe.md`). Пока веб живёт одним процессом,
 * этого хватает: повторная доставка в пределах процесса не применяется
 * дважды. На нескольких экземплярах журнал нужно заменить общим — ради
 * этого он и за интерфейсом.
 */
let ledger: PaymentEventLedger | null = null;

export function getPaymentEventLedger(): PaymentEventLedger {
  ledger ??= new InMemoryPaymentEventLedger();
  return ledger;
}

/** Подменяется в тестах и при переезде журнала в базу. */
export function setPaymentEventLedger(next: PaymentEventLedger | null): void {
  ledger = next;
}
