import { createPaymentProvider, type PaymentProvider } from "@repo/core";

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
