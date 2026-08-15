import { createDb } from "@repo/db";
import { getPaymentProvider } from "@/server/payments";
import { applySubscriptionChange } from "@/server/subscription";

/**
 * Вебхук платёжного провайдера — единственный вход, который меняет права
 * агентства без участия человека.
 *
 * Тело читается сырым: подпись считается по байтам запроса, и любая
 * нормализация JSON её сломает. Неподтверждённая подпись — 400 и ничего
 * больше: без этой проверки план агентства мог бы выдать себе кто угодно.
 */

/**
 * Подключение создаётся внутри обработчика, а не на уровне модуля: сборка
 * образа выполняет модуль, чтобы собрать данные страницы, и подключение
 * на импорте делает сборку зависимой от рантайм-настроек.
 */
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event;
  try {
    event = await getPaymentProvider().parseEvent(payload, signature);
  } catch (error) {
    console.error("[stripe] rejected webhook", error);
    return Response.json({ error: "Signature rejected" }, { status: 400 });
  }

  if (event.kind === "ignored") {
    // 200 намеренно: провайдер иначе будет слать это событие снова и снова.
    return Response.json({ received: true, applied: false, reason: event.reason });
  }

  const { db, close } = createDb();

  try {
    const outcome = await applySubscriptionChange(db, event);
    if (!outcome.applied) {
      console.error("[stripe] unlinked subscription event", outcome.reason);
    }

    return Response.json({ received: true, applied: outcome.applied });
  } finally {
    await close();
  }
}
