import { parseApiKey, verifyApiKey } from "@repo/core";
import { findApiKeyByPrefix, touchApiKey, type Database } from "@repo/db";

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
 * Простой ограничитель частоты в памяти процесса.
 *
 * Не распределённый и это честно сказано: за несколькими инстансами он
 * ограничивает каждый по отдельности. Его задача — не пустить один ключ
 * положить базу, а не быть точным счётчиком.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

const hits = new Map<string, { count: number; resetAt: number }>();

function withinRateLimit(keyId: string, now = Date.now()): boolean {
  const entry = hits.get(keyId);

  if (!entry || now >= entry.resetAt) {
    hits.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

/** Только для тестов: счётчик живёт в памяти процесса. */
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

  if (!withinRateLimit(stored.id)) {
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
