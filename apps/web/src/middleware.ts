import { NextResponse, type NextRequest } from "next/server";

/**
 * Что можно открыть на домене агентства.
 *
 * Отчёт клиенту может жить на домене агентства (`NEXT_PUBLIC_REPORT_HOST`).
 * Это одно приложение, поэтому по тому же адресу открылись бы и витрина, и
 * вход в продукт: клиент агентства, набрав `reports.agency.com/pricing`,
 * увидел бы наши тарифы — ровно тот след стороннего поставщика, ради
 * отсутствия которого white-label и существует (инвариант 3).
 *
 * Поэтому на этом домене разрешено только то, без чего не открывается сама
 * страница отчёта: сам отчёт, статика сборки, шрифты, файлы агентства
 * (логотип) и вызовы API, которыми страница подтверждает отчёт.
 *
 * Правило живёт здесь, а не только в настройках прокси: прокси — это чужая
 * машина и чужой конфиг, а обещание наше.
 */

const ALLOWED_PREFIXES = [
  "/r/",
  "/_next/",
  "/fonts/",
  "/api/files/",
  "/api/trpc",
  "/favicon.ico",
];

export function allowedOnReportHost(pathname: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** Хост из заголовка, без порта: сравнение идёт по имени. */
export function hostnameOf(request: NextRequest): string {
  const header = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return header.split(":")[0]?.toLowerCase() ?? "";
}

export function middleware(request: NextRequest): NextResponse {
  const reportHost = process.env.NEXT_PUBLIC_REPORT_HOST?.trim().toLowerCase();
  if (!reportHost) {
    // Своего домена у отчётов нет — приложение работает как обычно.
    return NextResponse.next();
  }

  if (hostnameOf(request) !== reportHost) {
    return NextResponse.next();
  }

  if (allowedOnReportHost(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  /**
   * Именно 404, а не редирект на наш домен: редирект показал бы клиенту, куда
   * он попал, и это тот же след поставщика. Страница «нет такой страницы» —
   * честный ответ для адреса, которого на этом домене действительно нет.
   */
  return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain" } });
}

export const config = {
  // Статику Next обслуживает и без middleware; сюда она заходит только ради
  // проверки хоста, поэтому исключать её не нужно.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
