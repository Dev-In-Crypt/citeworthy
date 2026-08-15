/**
 * Ключи публичного API.
 *
 * В базе лежит только хэш. Ключ показывается один раз при создании: продукт,
 * который умеет показать секрет второй раз, хранит его в открытом виде, и
 * утечка базы становится утечкой доступа ко всем агентствам сразу.
 *
 * Префикс хранится отдельно и не секретен — по нему ключ находится в базе,
 * не перебирая хэши, и по нему же агентство узнаёт свой ключ в списке.
 */

const TOKEN_PREFIX = "cw_live";
const PREFIX_LENGTH = 8;
const SECRET_LENGTH = 32;

/** Без похожих символов: ключ читают с экрана и переносят руками. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export interface GeneratedApiKey {
  /** Полный ключ. Показывается один раз и больше не восстановим. */
  token: string;
  /** Открытая часть: по ней ключ ищется и опознаётся в списке. */
  prefix: string;
  /** То, что попадает в базу. */
  hash: string;
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export async function hashApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const prefix = randomString(PREFIX_LENGTH);
  const token = `${TOKEN_PREFIX}_${prefix}_${randomString(SECRET_LENGTH)}`;

  return { token, prefix, hash: await hashApiKey(token) };
}

/**
 * Разбирает предъявленный ключ. Возвращает null на всём, что не похоже на
 * наш формат, — до похода в базу: неверный ключ не должен стоить запроса.
 */
export function parseApiKey(token: string): { prefix: string } | null {
  const parts = token.trim().split("_");
  if (parts.length !== 4) return null;

  const [scheme, kind, prefix, secret] = parts;
  if (`${scheme}_${kind}` !== TOKEN_PREFIX) return null;
  if (!prefix || prefix.length !== PREFIX_LENGTH) return null;
  if (!secret || secret.length !== SECRET_LENGTH) return null;

  return { prefix };
}

/** Сравнение за постоянное время: время ответа не должно подсказывать хэш. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Ключ, предъявленный запросом, совпадает с записанным и не отозван. */
export async function verifyApiKey(
  token: string,
  stored: { hash: string; revokedAt: Date | null },
): Promise<boolean> {
  if (stored.revokedAt !== null) {
    return false;
  }
  return timingSafeEqual(await hashApiKey(token), stored.hash);
}
