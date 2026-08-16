"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Code2, CreditCard, Settings, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/usage", label: "Usage", icon: Wallet },
  { href: "/settings/billing", label: "Plan", icon: CreditCard },
  { href: "/settings/api", label: "API", icon: Code2 },
] as const;

/**
 * Подсвечивается самый длинный подходящий пункт: иначе на /settings/usage
 * текущими оказались бы сразу два, и «где я» перестало бы читаться.
 */
function activeHref(pathname: string): string | undefined {
  return NAV.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
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
      <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r bg-secondary/40 px-3 py-5 md:flex">
        <div className="px-2">
          <p className="truncate text-sm font-semibold" title={agencyName}>
            {agencyName}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === current;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          На телефоне шесть ссылок и кнопка выхода не помещаются в 375 пикселей
          и раздвигают страницу шире экрана — на каждом экране продукта, а не
          только на новых. Ряд ссылок прокручивается сам, кнопка не сжимается,
          а горизонтальную прокрутку самой страницы это больше не создаёт.
        */}
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <nav className="-mx-1 flex min-w-0 gap-3 overflow-x-auto px-1 md:hidden">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="shrink-0 text-sm whitespace-nowrap text-muted-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-sm text-muted-foreground md:inline">AI Search delivery</span>
          <div className="shrink-0">
            <SignOutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
