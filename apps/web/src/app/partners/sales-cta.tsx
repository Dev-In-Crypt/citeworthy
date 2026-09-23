import Link from "next/link";
import type { SalesContact } from "@/config/site";
import { SALES_CONTACT } from "@/config/site";

/**
 * Кнопка «поговорить с человеком» для страниц потока G.
 *
 * Контакт читается из `@/config/site` (переменные `NEXT_PUBLIC_SALES_*`), а не
 * вписывается в разметку. Пока переменной нет, `SALES_CONTACT` равен null —
 * и страница не обещает звонок: вместо него стоит путь через бесплатный аудит,
 * который работает всегда.
 *
 * Решение вынесено в чистую функцию `salesCtaTarget`, чтобы его можно было
 * проверить тестом без рендера React.
 */

export interface CtaTarget {
  /** sales — ведёт к человеку; audit — запасной путь, никакого обещания. */
  kind: "sales" | "audit";
  label: string;
  href: string;
  /** Внешняя ссылка (mailto:/календарь) рендерится обычным <a>, не <Link>. */
  external: boolean;
}

export const AUDIT_FALLBACK = {
  label: "Start with the free audit",
  href: "/free-audit",
} as const;

/**
 * Что показать вместо контакта, когда контакта нет.
 *
 * Отдельная функция, а не тернарник в разметке: «скрыт, пока не задан» —
 * это поведение, за которым следит тест, а не деталь вёрстки.
 */
export function salesCtaTarget(
  contact: SalesContact | null,
  fallback: { label: string; href: string } = AUDIT_FALLBACK,
): CtaTarget {
  if (contact) {
    return {
      kind: "sales",
      label: contact.label,
      href: contact.href,
      external: !contact.href.startsWith("/"),
    };
  }

  return { kind: "audit", label: fallback.label, href: fallback.href, external: false };
}

/** Есть ли кому звонить. Блоки «поговорите с нами» целиком прячутся по этому флагу. */
export const HAS_SALES_CONTACT = SALES_CONTACT !== null;

export function SalesCta({
  className = "link",
  fallbackLabel = AUDIT_FALLBACK.label,
  fallbackHref = AUDIT_FALLBACK.href,
  arrow = true,
}: {
  className?: string;
  fallbackLabel?: string;
  fallbackHref?: string;
  arrow?: boolean;
}) {
  const target = salesCtaTarget(SALES_CONTACT, { label: fallbackLabel, href: fallbackHref });
  const text = arrow ? `${target.label} →` : target.label;

  if (target.external) {
    return (
      <a className={className} href={target.href} data-testid="sales-contact">
        {text}
      </a>
    );
  }

  return (
    <Link className={className} href={target.href} data-testid="sales-fallback">
      {text}
    </Link>
  );
}
