import { REPORT_HOST } from "@/config/site";

/**
 * Адреса клиентского отчёта.
 *
 * Ссылка, которую агентство отдаёт своему клиенту, — единственная страница
 * продукта, которую видит посторонний человек. Инвариант 3 требует, чтобы на
 * ней не было нашего бренда; домен в адресной строке — самая заметная его
 * часть. Поэтому при заданном NEXT_PUBLIC_REPORT_HOST ссылка строится на
 * домене агентства, а не на нашем.
 *
 * Три адреса одной страницы намеренно разделены:
 *
 * - `reportPath` — то, что показывается внутри интерфейса агентства;
 * - `reportUrl` — то, что уходит наружу: в письмо и в буфер обмена;
 * - `internalReportUrl` — то, по чему печатается PDF. Печатает браузер на той
 *   же машине, и публичный адрес ему не подходит: снаружи другой порт, а за
 *   прокси — лишний круг через интернет, который в закрытой сети не пройдёт.
 *
 * Ни одна переменная не обязательна: без них всё работает на адресе продукта.
 */

/** Запасной адрес: тот же, что у `appUrl()` в server/email.ts. */
const FALLBACK_APP_ORIGIN = "http://localhost:3000";

/** Запасной внутренний адрес: standalone-сервер Next слушает этот порт. */
const FALLBACK_INTERNAL_ORIGIN = "http://127.0.0.1:3000";

type Env = Record<string, string | undefined>;

/**
 * Хост из настроек превращается в origin.
 *
 * Агентство напишет домен так, как привыкло его называть: с протоколом, без
 * него, со слэшем на конце. Отказывать из-за этого нельзя — получится ссылка
 * вида `reports.agency.com//r/abc`, и клиент увидит ошибку вместо отчёта.
 * Без протокола подставляется https: отчёт уходит наружу, http для него не
 * вариант.
 */
function toOrigin(value: string, fallbackProtocol = "https://"): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `${fallbackProtocol}${trimmed}`;
}

/** Путь к отчёту внутри приложения. */
export function reportPath(token: string): string {
  return `/r/${encodeURIComponent(token)}`;
}

/** Публичный адрес продукта — из него строятся ссылки, когда своего домена нет. */
export function appOrigin(env: Env = process.env): string {
  const configured = env["NEXT_PUBLIC_APP_URL"] ?? env["BETTER_AUTH_URL"];
  return configured?.trim() ? toOrigin(configured) : FALLBACK_APP_ORIGIN;
}

/**
 * Ссылка на отчёт для клиента агентства.
 *
 * @param options.reportHost домен агентства; по умолчанию — из настроек сайта.
 *   `null` означает «своего домена нет», а не «ошибка».
 */
export function reportUrl(
  token: string,
  options: { reportHost?: string | null; origin?: string } = {},
): string {
  const host = options.reportHost === undefined ? REPORT_HOST : options.reportHost;
  const origin = host?.trim() ? toOrigin(host) : (options.origin ?? appOrigin());
  return `${origin}${reportPath(token)}`;
}

/**
 * Адрес той же страницы для печати PDF изнутри контейнера.
 *
 * Домен агентства сюда не подставляется никогда: его DNS указывает на прокси
 * снаружи, а из контейнера этот путь может не существовать вовсе.
 */
export function internalReportUrl(token: string, env: Env = process.env): string {
  const configured = env["INTERNAL_APP_URL"] ?? env["NEXT_PUBLIC_APP_URL"];
  const origin = configured?.trim()
    ? toOrigin(configured, "http://")
    : FALLBACK_INTERNAL_ORIGIN;
  return `${origin}${reportPath(token)}`;
}
