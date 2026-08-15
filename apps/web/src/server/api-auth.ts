import { parseApiKey, verifyApiKey } from "@repo/core";
import { findApiKeyByPrefix, touchApiKey, type Database } from "@repo/db";
import { getRedis } from "./redis";

/**
 * Авторизация публичного API по ключу агентства.
 *
 * Ответы намеренно скупые: неверный ключ, отозванный ключ и ключ чужого
 * агентства выглядят одинаково. Публичный эндпоинт не должен подсказывать,
 * какая часть предъявленного была верной.
 */

export interface ApiCaller {
  agencyId: string;
  keyId: string;
}

export type ApiAuthResult =
  | { ok: true; caller: ApiCaller }
  | { ok: false; status: 401 | 429; message: string };

/**
 * Ограничитель частоты: счёт в Redis, если он есть.
 *
 * В памяти процесса счётчик считал бы каждый инстанс отдельно, и предъявленный
 * лимит тихо умножался бы на их число. Redis в развёртывании уже стоит —
 * очередь воркера без него не работает.
 *
 * Без Redis остаётся счёт в памяти: разработка и тесты не должны требовать
 * поднятой очереди, а один процесс считает себя правильно.
 */
const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 120;

const hits = new Map<string, { count: number; resetAt: number }>();

function withinLocalLimit(keyId: string, now = Date.now()): boolean {
  const entry = hits.get(keyId);

  if (!entry || now >= entry.resetAt) {
    hits.set(keyId, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

async function withinRateLimit(keyId: string, now = Date.now()): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return withinLocalLimit(keyId, now);
  }

  // Окно привязано к минуте, а не к первому запросу: так двум инстансам не
  // нужно договариваться, когда оно началось.
  const window = Math.floor(now / (WINDOW_SECONDS * 1000));
  const key = `api-rate:${keyId}:${window}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS * 2);
    }
    return count <= MAX_REQUESTS_PER_WINDOW;
  } catch (error) {
    // Недоступный Redis не должен закрывать API целиком: считаем в памяти
    // и продолжаем. Хуже пустить лишний запрос, чем отключить агентству
    // выгрузку из-за перезапуска очереди.
    console.error("[api] rate limit fell back to memory", error);
    return withinLocalLimit(keyId, now);
  }
}

/** Только для тестов: счётчик в памяти живёт в процессе. */
export function resetRateLimit(): void {
  hits.clear();
}

export async function authenticateApiRequest(
  db: Database,
  request: Request,
): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  // Формат проверяется до похода в базу: неверный ключ не стоит запроса.
  const parsed = token ? parseApiKey(token) : null;
  if (!parsed) {
    return { ok: false, status: 401, message: "Provide a valid API key as a bearer token." };
  }

  const stored = await findApiKeyByPrefix(db, parsed.prefix);
  if (!stored || !(await verifyApiKey(token, stored))) {
    return { ok: false, status: 401, message: "Provide a valid API key as a bearer token." };
  }

  if (!(await withinRateLimit(stored.id))) {
    return { ok: false, status: 429, message: "Too many requests for this key. Try in a minute." };
  }

  await touchApiKey(db, stored.id);

  return { ok: true, caller: { agencyId: stored.agencyId, keyId: stored.id } };
}

export function apiError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Чужой ресурс неотличим от несуществующего — то же правило, что в tRPC. */
export function notFound(): Response {
  return apiError(404, "Not found");
}
