import { cn } from "@/lib/utils";

/**
 * Знак продукта.
 *
 * До этого имя «Citeworthy» существовало в приложении только как текст в
 * заголовке вкладки, а на самой вкладке продукт был безымянным — браузер
 * показывал заглушку. Знак — те же цитатные скобки, что в favicon: ссылка на
 * источник в тексте выглядит как [1], и продукт как раз про то, попал ли
 * клиент в такую ссылку.
 *
 * Цвет берётся из акцента темы, а не задан жёстко: в клиентском отчёте акцент
 * подменяется цветом агентства, и знак туда не попадает вовсе — но если
 * когда-нибудь попадёт, он не должен спорить с чужим брендом.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
      fill="none"
    >
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="square" className="text-primary-foreground">
        <path d="M13 8 H9 V24 H13" />
        <path d="M19 8 H23 V24 H19" />
      </g>
      <circle cx="16" cy="16" r="2.2" className="fill-primary-foreground" />
    </svg>
  );
}
