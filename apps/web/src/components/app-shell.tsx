"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Code2, CreditCard, Settings, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Mark } from "@/components/ui/mark";

/**
 * Каркас приложения.
 *
 * Пункты разделены на две группы, потому что это два разных занятия. Работа с
 * клиентами — то, зачем сюда заходят каждый день; счёт, ключи и тариф — то,
 * куда заходят раз в месяц. Одним плоским списком из шести пунктов они
 * выглядели равнозначными, и глазу приходилось перечитывать весь список,
 * чтобы найти нужное.
 *
 * Внизу сайдбара — агентство и текущий пользователь: сверху продукт, снизу
 * тот, кто в нём работает. Раньше имя агентства стояло сверху и читалось так,
 * будто приложение принадлежит ему; принадлежит ему только отчёт клиенту.
 */

const WORK = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/clients", label: "Clients", icon: Users },
] as const;

const ACCOUNT = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/usage", label: "Usage", icon: Wallet },
  { href: "/settings/billing", label: "Plan", icon: CreditCard },
  { href: "/settings/api", label: "API", icon: Code2 },
] as const;

const NAV = [...WORK, ...ACCOUNT];

/**
 * Подсвечивается самый длинный подходящий пункт: иначе на /settings/usage
 * текущими оказались бы сразу два, и «где я» перестало бы читаться.
 */
function activeHref(pathname: string): string | undefined {
  return NAV.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Тип берётся из самих массивов, а не описывается как `href: string`:
 * типизированные роуты Next проверяют literal type ссылки, и обобщённая
 * строка перестаёт быть известным адресом.
 */
function NavGroup({
  items,
  current,
  label,
}: {
  items: typeof WORK | typeof ACCOUNT;
  current: string | undefined;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
          {label}
        </p>
      )}
      {items.map(({ href, label: text, icon: Icon }) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              // Подсветка акцентом, а не карточкой: в тёмной теме фон карточки
              // совпадает с фоном панели, и текущий пункт становится не виден.
              active
                ? "bg-primary/12 font-medium text-foreground"
                : "text-muted-foreground hover:bg-primary/6 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
              aria-hidden
            />
            {text}
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({
  agencyName,
  userEmail,
  children,
}: {
  agencyName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = activeHref(pathname);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-secondary/40 px-3 py-4 md:flex">
        <Link
          href="/dashboard"
          className="mb-6 flex items-center gap-2 px-2 py-1 text-sm font-semibold tracking-tight"
        >
          <Mark className="size-5" />
          Citeworthy
        </Link>

        <nav className="flex flex-col gap-5">
          <NavGroup items={WORK} current={current} />
          <NavGroup items={ACCOUNT} current={current} label="Account" />
        </nav>

        {/* Прижато к низу: кто здесь работает — справочная информация, а не
            то, с чего начинают читать экран. */}
        <div className="mt-auto border-t px-2 pt-3">
          <p className="truncate text-sm font-medium" title={agencyName}>
            {agencyName}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          На телефоне сайдбара нет, и все шесть ссылок живут здесь. В 375
          пикселей они не помещаются, поэтому ряд прокручивается сам, а кнопки
          справа не сжимаются — горизонтальной прокрутки самой страницы это
          больше не создаёт.
        */}
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <Mark className="size-5" />
            <nav className="-mx-1 flex min-w-0 gap-3 overflow-x-auto px-1">
              {NAV.map(({ href, label }) => {
                const active = href === current;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "shrink-0 text-sm whitespace-nowrap",
                      active ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <span className="hidden text-sm text-muted-foreground md:inline">AI Search delivery</span>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
