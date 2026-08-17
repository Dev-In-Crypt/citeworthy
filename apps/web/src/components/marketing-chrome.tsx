import Link from "next/link";
import { Mark } from "@/components/ui/mark";

/**
 * Шапка и подвал публичных страниц: лендинга и примера отчёта.
 *
 * Внутри самого отчёта их быть не может — там бренд агентства и ноль следов
 * продукта (инвариант 3), поэтому обрамление всегда снаружи `ReportView`.
 */

export function MarketingHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <Mark className="size-5" />
          Citeworthy
        </Link>

        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/sample-report" className="hover:text-foreground">
            Example report
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Citeworthy — AI search measurement and delivery for agencies.</span>
        <nav className="flex gap-5">
          <Link href="/sample-report" className="hover:text-foreground">
            Example report
          </Link>
          <Link href="/signup" className="hover:text-foreground">
            Create account
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
