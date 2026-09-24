import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@repo/db";
import { DbPaymentEventLedger } from "./payments";

/**
 * Журнал событий вебхука обязан пережить перезапуск.
 *
 * Пока он жил в памяти процесса, деплой стирал его целиком: Stripe повторяет
 * доставку трое суток, и событие, применённое минуту назад, после
 * перезапуска применялось второй раз — второй раз менялся тариф и второй раз
 * уходило письмо клиенту. Второй экземпляр приложения не видел и того, что
 * обработал первый.
 *
 * Проверяется именно это: новый журнал поверх той же базы — это и есть
 * «после перезапуска».
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

function eventId(): string {
  return `evt_${Math.random().toString(36).slice(2, 12)}`;
}

describe("DbPaymentEventLedger", () => {
  it("событие, занятое до перезапуска, после перезапуска не занимается снова", async () => {
    const id = eventId();
    const at = new Date();

    const before = new DbPaymentEventLedger(db);
    expect((await before.claim(id, at)).claimed).toBe(true);

    // Другой экземпляр журнала — как другой процесс после деплоя.
    const after = new DbPaymentEventLedger(db);
    const repeat = await after.claim(id, at);

    expect(repeat.claimed).toBe(false);
    if (!repeat.claimed) {
      expect(repeat.reason).toContain("already processed");
    }
  });

  it("отпущенное событие можно занять снова", async () => {
    // Сбой записи не должен превращаться в потерянное событие: провайдер
    // повторит доставку, и журнал обязан её принять.
    const id = eventId();
    const ledger = new DbPaymentEventLedger(db);

    expect((await ledger.claim(id, new Date())).claimed).toBe(true);
    await ledger.release(id);
    expect((await ledger.claim(id, new Date())).claimed).toBe(true);
  });

  it("одновременные доставки одного события занимает ровно одна", async () => {
    // Гонку разрешает первичный ключ в базе, а не порядок вызовов здесь:
    // за двумя экземплярами приложения этот порядок никто не держит.
    const id = eventId();
    const at = new Date();

    const claims = await Promise.all(
      [1, 2, 3].map(() => new DbPaymentEventLedger(db).claim(id, at)),
    );

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
  });

  it("разные события друг другу не мешают", async () => {
    const ledger = new DbPaymentEventLedger(db);
    expect((await ledger.claim(eventId(), new Date())).claimed).toBe(true);
    expect((await ledger.claim(eventId(), new Date())).claimed).toBe(true);
  });
});
