import Link from "next/link";
import type { ComponentProps } from "react";
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

/** Внутренний путь в том виде, в каком его принимает typedRoutes. */
type InternalHref = ComponentProps<typeof Link>["href"];

export interface CtaTarget {
  /** sales — ведёт к человеку; audit — запасной путь, никакого обещания. */
  kind: "sales" | "audit";
  label: string;
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
  fallbackLabel: string = AUDIT_FALLBACK.label,
): CtaTarget {
  if (contact) {
    return { kind: "sales", label: contact.label };
  }

  return { kind: "audit", label: fallbackLabel };
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
  fallbackHref?: InternalHref;
  arrow?: boolean;
}) {
  const target = salesCtaTarget(SALES_CONTACT, fallbackLabel);
  const text = arrow ? `${target.label} →` : target.label;

  // Контакт — это всегда mailto: или чужой календарь, то есть обычный <a>.
  // Внутренние пути ходят только через запасной путь, и только они знают
  // про typedRoutes.
  if (target.kind === "sales" && SALES_CONTACT) {
    return (
      <a className={className} href={SALES_CONTACT.href} data-testid="sales-contact">
        {text}
      </a>
    );
  }

  return (
    <Link className={className} href={fallbackHref} data-testid="sales-fallback">
      {text}
    </Link>
  );
}
