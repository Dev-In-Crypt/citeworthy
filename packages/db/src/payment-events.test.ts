import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { claimPaymentEvent, prunePaymentEvents, releasePaymentEvent } from "./queries";

/**
 * Журнал событий платёжного провайдера.
 *
 * Проверяется ровно то, ради чего он заведён: повторная доставка одного
 * события не должна примениться дважды, а сбой обработки не должен превратить
 * событие в потерянное.
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

function eventId(): string {
  return `evt_${Math.random().toString(36).slice(2, 12)}`;
}

describe("журнал событий оплаты", () => {
  it("первое занятие проходит, повтор того же события — нет", async () => {
    const id = eventId();
    const occurred = new Date();

    expect(await claimPaymentEvent(db, id, occurred)).toBe(true);
    // Stripe повторяет доставку до трёх суток; второй раз менять тариф нельзя.
    expect(await claimPaymentEvent(db, id, occurred)).toBe(false);
  });

  it("одновременные попытки занять событие дают ровно одного победителя", async () => {
    const id = eventId();
    const occurred = new Date();

    const results = await Promise.all([
      claimPaymentEvent(db, id, occurred),
      claimPaymentEvent(db, id, occurred),
      claimPaymentEvent(db, id, occurred),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("освобождённое событие можно занять снова", async () => {
    const id = eventId();
    const occurred = new Date();

    await claimPaymentEvent(db, id, occurred);
    await releasePaymentEvent(db, id);

    // Иначе сбой базы посреди обработки превратился бы в потерянное событие:
    // повтор от провайдера увидел бы занятый идентификатор и не сделал ничего.
    expect(await claimPaymentEvent(db, id, occurred)).toBe(true);
  });

  it("уборка удаляет старые записи и не трогает свежие", async () => {
    const old = eventId();
    const fresh = eventId();
    const now = new Date();

    await claimPaymentEvent(db, old, new Date(now.getTime() - 10 * 86_400_000));
    await claimPaymentEvent(db, fresh, now);

    const removed = await prunePaymentEvents(db, new Date(now.getTime() - 60_000));

    expect(removed).toBeGreaterThanOrEqual(1);
    // Свежая запись на месте: её событие провайдер ещё может повторить.
    expect(await claimPaymentEvent(db, fresh, now)).toBe(false);
  });
});
