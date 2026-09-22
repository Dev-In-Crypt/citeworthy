import Link from "next/link";
import { Wordmark } from "./logo";
import "./marketing.css";

/**
 * Шапка и подвал витрины: /, /product, /pricing, /free-audit и примеры отчёта.
 *
 * Внутри самого отчёта их быть не может — там бренд агентства и ноль следов
 * продукта (инвариант 3), поэтому обрамление всегда снаружи `ReportView`, а
 * каждый кусок обрамления — свой корень `.mk`: стили витрины не достают до
 * отчёта, стоящего между ними.
 *
 * Мобильное меню — `<details>`: открывается без JavaScript, и шапке не нужен
 * клиентский компонент.
 */

export type MarketingSection = "product" | "sample" | "pricing" | "audit";

const NAV = [
  { id: "product", label: "Product", href: "/product" },
  { id: "sample", label: "Sample report", href: "/sample-report" },
  { id: "pricing", label: "Pricing", href: "/pricing" },
  { id: "audit", label: "Free audit", href: "/free-audit" },
] as const;

function NavLinks({ active }: { active?: MarketingSection }) {
  return NAV.map((item) => (
    <Link key={item.id} href={item.href} aria-current={item.id === active ? "page" : undefined}>
      {item.label}
    </Link>
  ));
}

export function MarketingHeader({ active }: { active?: MarketingSection }) {
  return (
    <header data-surface="marketing" className="mk site-head" data-testid="marketing-header">
      <div className="wrap">
        <Link className="brand" href="/" aria-label="Citeworthy home">
          <Wordmark />
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLinks active={active} />
        </nav>
        <div className="head-right">
          <Link className="signin" href="/login">
            Sign in
          </Link>
          <Link className="btn primary sm" href="/signup" data-testid="header-cta">
            <span className="cta-long">Start a free audit</span>
            <span className="cta-short">Free audit</span>
          </Link>
          <details className="menu" data-testid="mobile-menu">
            <summary aria-label="Menu">
              <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
                <path d="M1 1h16M1 7h16M1 13h16" stroke="#15171C" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </summary>
            <nav className="panel" aria-label="Main, compact">
              <NavLinks active={active} />
              <Link href="/login">Sign in</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer data-surface="marketing" className="mk site-foot">
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <Wordmark dot="#7C86FF" />
            <p>
              AI Search measurement, diagnosis and white-label reporting for agencies. Measures
              ChatGPT, Perplexity and Gemini by default; Claude and Grok can be switched on per
              client.
            </p>
          </div>
          <div className="foot-col">
            <h2>Product</h2>
            <ul>
              <li><Link href="/product#measure">Measure</Link></li>
              <li><Link href="/product#diagnose">Diagnose</Link></li>
              <li><Link href="/product#act">Opportunities</Link></li>
              <li><Link href="/product#experiments">Experiments</Link></li>
              <li><Link href="/product#reports">Reports</Link></li>
              <li><Link href="/product#api">API</Link></li>
            </ul>
          </div>
          <div className="foot-col">
            <h2>Start</h2>
            <ul>
              <li><Link href="/free-audit">Free audit</Link></li>
              <li><Link href="/sample-report">Sample report</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/login">Sign in</Link></li>
            </ul>
          </div>
          <div className="foot-col">
            <h2>Method</h2>
            <ul>
              <li><Link href="/#limits">What this does not do</Link></li>
              <li><Link href="/#evidence">How we measure</Link></li>
              <li><Link href="/sample-report/audit">Sample audit report</Link></li>
            </ul>
          </div>
        </div>
        <div className="foot-small">
          <span>
            Every figure on this site is estimated from repeated samples of assistant answers.
            Example agencies, clients, competitors and *.example domains are invented.
          </span>
          <span>© 2026 Citeworthy</span>
        </div>
      </div>
    </footer>
  );
}

/** Страница витрины целиком: шапка, содержимое, подвал. */
export function MarketingShell({
  active,
  children,
}: {
  active?: MarketingSection;
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingHeader active={active} />
      <main data-surface="marketing" className="mk">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
