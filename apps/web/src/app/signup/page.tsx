import type { Metadata } from "next";
import Link from "next/link";
import { ASSISTANTS, DEFAULT_PLATFORMS, FREE_CHECK_ALLOWANCE, MARKETING_COPY } from "@repo/core";
import { AuthForm } from "@/components/auth-form";
import { MarketingShell } from "@/components/marketing/chrome";

/**
 * Регистрация в оформлении витрины.
 *
 * Раньше экран стоял голым посреди тёмного поля: ни шапки, ни выхода —
 * человек, попавший сюда с главной, мог только вернуться назад браузером.
 * Регистрация — часть витрины, а не отдельное приложение, поэтому и
 * обрамление у неё то же: шапка со всеми разделами и подвал.
 *
 * Рядом с формой — что именно человек получит, бесплатно и без карты.
 * Это не украшение: до этого экрана он читал обещания, и здесь последний
 * момент, когда они должны совпасть с тем, что произойдёт дальше.
 */

export const metadata: Metadata = {
  title: "Create your workspace · Citeworthy",
  description: `Run the free audit on one brand: ${FREE_CHECK_ALLOWANCE} AI checks, no card.`,
};

/** Подписи запускной тройки — из каталога, а не литералом на экране. */
const DEFAULT_ASSISTANTS = DEFAULT_PLATFORMS.map(
  (id) => ASSISTANTS.find((assistant) => assistant.id === id)?.label ?? id,
).join(", ");

const INCLUDED = [
  `${FREE_CHECK_ALLOWANCE} free AI checks — one full audit on one brand`,
  `${DEFAULT_ASSISTANTS}, every question asked several times`,
  "The report in your brand, not ours",
  MARKETING_COPY.limits.nothingPublished,
];

export default function SignupPage() {
  return (
    <MarketingShell>
      <div className="wrap">
        <section className="auth-sec">
          <div className="kicker page-kicker">Free audit</div>
          <h1 className="display">
            Create your <em>workspace.</em>
          </h1>
          <p className="lead auth-lead">
            Run the free audit on one brand, read the whole report, then decide. No card is asked
            for, and nothing is charged to run it.
          </p>

          <div className="auth-cols">
            <div className="auth-form">
              <AuthForm mode="signup" />
              <p className="small auth-alt">
                Already have an account? <Link href="/login">Sign in</Link>
              </p>
            </div>

            <ul className="auth-included">
              {INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
