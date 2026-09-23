/**
 * Вычистка чувствительного из всего, что уходит в отчёт об ошибке.
 *
 * Один скраббер на все три репортера (воркер, сервер web, браузер): место,
 * где решают, что секрет, должно быть одно. Иначе правило «почту не шлём»
 * живёт в браузере, а сервер продолжает класть e-mail в extra.
 *
 * Принцип — отбрасывать значения, а не имена. `promptId`, `runId`, имя поля
 * `password` в отчёте полезны: по ним видно, где сломалось. Ценность имеет
 * только значение, и именно оно заменяется на маркер.
 */

export const REDACTED = "[redacted]";
export const REDACTED_EMAIL = "[email]";

/**
 * Имена полей, значение которых не нужно никогда.
 *
 * Сравнение по нормализованному имени (без разделителей, в нижнем регистре),
 * а не по подстроке: подстрока `token` вычистила бы `tokensIn` и `maxTokens`,
 * то есть счётчики стоимости — ровно те цифры, ради которых в отчёт и смотрят.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "secret",
  "clientsecret",
  "apikey",
  "apisecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authtoken",
  "sessiontoken",
  "bearer",
  "authorization",
  "auth",
  "cookie",
  "cookies",
  "setcookie",
  "credential",
  "credentials",
  "privatekey",
  "secretkey",
  "accesskey",
  "signature",
  "jwt",
  "otp",
  "pin",
  "dsn",
  "sentrydsn",
  "email",
  "emailaddress",
  "useremail",
  "contactemail",
  "sessionid",
  "phone",
  "phonenumber",
  "ssn",
]);

/** Окончания имён, которые тоже значат секрет: `stripeSecret`, `webhookSecret`. */
const SENSITIVE_SUFFIXES = ["password", "secret", "apikey", "privatekey", "accesskey", "dsn"];

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (SENSITIVE_KEYS.has(normalised)) return true;
  return SENSITIVE_SUFFIXES.some((suffix) => normalised.endsWith(suffix));
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi;
/** `password: x`, `"token" = y`, `api_key=z` — ключ остаётся, значение уходит. */
const KEY_VALUE_RE =
  /("?\b(?:password|passwd|pwd|passphrase|secret|api[_-]?key|apikey|token|credential|private[_-]?key|access[_-]?key|signature|dsn)\b"?\s*)([:=])(\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi;
/**
 * Заголовки авторизации и куки: значение там из двух слов («Bearer abc»)
 * и обычной парой ключ-значение не снимается — после неё в строке остаётся
 * сам токен.
 */
const HEADER_SECRET_RE =
  /("?\b(?:authorization|proxy-authorization|cookie|set-cookie)\b"?\s*)([:=])(\s*)[^\s;,]+(?:\s+[^\s;,]+)?/gi;
/** `Bearer abc`, `Basic dXNlcjpwYXNz`. */
const AUTH_SCHEME_RE = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
/**
 * Ключи с узнаваемым префиксом: Stripe, OpenAI, Slack, GitHub, Google, Resend.
 * Ловится форма, а не конкретный провайдер: `xx_живое-значение`.
 */
const PREFIXED_SECRET_RE =
  /\b(?:sk|pk|rk|ak|whsec|re|xox[abceoprs]|ghp|gho|ghu|ghs|github_pat|AIza|SG|shpat|npm)[-_][A-Za-z0-9_-]{8,}/g;

/** Значения параметров запроса не нужны: там токены отчётов и адреса почты. */
function scrubUrl(url: string): string {
  const queryAt = url.indexOf("?");
  if (queryAt === -1) return url;

  const head = url.slice(0, queryAt);
  const rest = url.slice(queryAt + 1);
  const hashAt = rest.indexOf("#");
  const query = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const tail = hashAt === -1 ? "" : rest.slice(hashAt);

  const scrubbed = query
    .split("&")
    .map((pair) => {
      if (pair === "") return pair;
      const eq = pair.indexOf("=");
      if (eq === -1) return `${pair}=${REDACTED}`;
      return `${pair.slice(0, eq)}=${REDACTED}`;
    })
    .join("&");

  return `${head}?${scrubbed}${tail}`;
}

/**
 * Чистка строки: сообщения, стека, имени файла — всего, что человек читает.
 *
 * Порядок важен: сначала URL (иначе пара `token=...` внутри адреса будет
 * вычищена дважды и адрес перестанет читаться), потом пары ключ-значение,
 * потом самостоятельные формы секретов, и последней — почта.
 */
export function scrubString(value: string): string {
  const asValue = (_match: string, key: string, sep: string, space: string): string =>
    [key, sep, space, REDACTED].join("");

  return value
    .replace(URL_RE, (url) => scrubUrl(url))
    .replace(HEADER_SECRET_RE, asValue)
    .replace(KEY_VALUE_RE, asValue)
    .replace(JWT_RE, REDACTED)
    .replace(AUTH_SCHEME_RE, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(PREFIXED_SECRET_RE, REDACTED)
    .replace(EMAIL_RE, REDACTED_EMAIL);
}

export interface ScrubOptions {
  /** Глубже — `[depth limit]`: защита от циклов через прокси и гигантских деревьев. */
  maxDepth?: number;
  /** Длиннее — обрезается: одна ошибка не должна занимать мегабайт. */
  maxStringLength?: number;
}

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_STRING = 8192;

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…[truncated ${value.length - limit}]`;
}

/**
 * Рекурсивная чистка любого значения: вложенные объекты, массивы, ошибки.
 *
 * Сюда приходит `extra` из произвольного места кода — гарантировать, что там
 * нет данных клиента агентства, нельзя, поэтому проверяется каждый уровень.
 */
export function scrubValue(value: unknown, options: ScrubOptions = {}): unknown {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxString = options.maxStringLength ?? DEFAULT_MAX_STRING;
  const seen = new WeakSet<object>();

  function walk(current: unknown, depth: number): unknown {
    if (current === null || current === undefined) return current;

    switch (typeof current) {
      case "string":
        return truncate(scrubString(current), maxString);
      case "number":
      case "boolean":
        return current;
      case "bigint":
        return current.toString();
      case "function":
        return "[function]";
      case "symbol":
        return current.toString();
      default:
        break;
    }

    const object = current as object;
    if (seen.has(object)) return "[circular]";
    if (depth >= maxDepth) return "[depth limit]";
    seen.add(object);

    try {
      if (object instanceof Date) return object.toISOString();
      if (object instanceof Error) {
        return {
          name: object.name,
          message: truncate(scrubString(object.message), maxString),
          ...(object.stack === undefined
            ? {}
            : { stack: truncate(scrubString(object.stack), maxString) }),
        };
      }
      if (object instanceof RegExp) return scrubString(object.toString());
      if (Array.isArray(object)) return object.map((item) => walk(item, depth + 1));
      if (object instanceof Set) return [...object].map((item) => walk(item, depth + 1));
      if (object instanceof Map) {
        const out: Record<string, unknown> = {};
        for (const [key, item] of object) {
          const name = String(key);
          out[name] = isSensitiveKey(name) ? REDACTED : walk(item, depth + 1);
        }
        return out;
      }
      if (!isPlainObject(object)) {
        // Экземпляр чужого класса: структуру не знаем, отдаём его же описание.
        return truncate(scrubString(String(object)), maxString);
      }

      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(object)) {
        if (item === undefined) continue;
        out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1);
      }
      return out;
    } finally {
      seen.delete(object);
    }
  }

  return walk(value, 0);
}

/** Верхний уровень полей лога или `extra` Sentry. */
export function scrubFields(
  fields: Record<string, unknown>,
  options: ScrubOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = isSensitiveKey(key) ? REDACTED : scrubValue(value, options);
  }
  return out;
}

/**
 * Событие Sentry перед отправкой.
 *
 * Помимо общей чистки здесь снимаются куски, которые SDK собирает сам и
 * которые целиком слать нельзя: заголовки и тело запроса, куки, профиль
 * пользователя. Из профиля остаётся только `id` — по нему разработчик поймёт,
 * что упало у одного и того же человека, и не узнает, у кого именно.
 */
export function scrubEvent<T extends Record<string, unknown>>(
  event: T,
  options: ScrubOptions = {},
): T {
  const depth = { maxDepth: options.maxDepth ?? 12, maxStringLength: options.maxStringLength };
  const scrubbed = scrubValue(event, depth) as Record<string, unknown>;

  const request = scrubbed["request"];
  if (request !== null && typeof request === "object") {
    const safe = request as Record<string, unknown>;
    delete safe["headers"];
    delete safe["cookies"];
    delete safe["data"];
    if (typeof safe["url"] === "string") safe["url"] = scrubUrl(safe["url"]);
  }

  const user = scrubbed["user"];
  if (user !== null && typeof user === "object") {
    const id = (user as Record<string, unknown>)["id"];
    if (id === undefined) delete scrubbed["user"];
    else scrubbed["user"] = { id };
  }

  return scrubbed as T;
}
