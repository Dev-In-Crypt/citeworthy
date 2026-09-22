import { cn } from "@/lib/utils";

/**
 * Знак продукта: [•] на плитке, по утверждённому брендбуку (logo-symbol.svg).
 *
 * Цитатные скобки с точкой: ссылка на источник в тексте выглядит как [1], и
 * продукт как раз про то, попал ли клиент в такую ссылку. Скобки — залитые
 * фигуры, а не обводка: так геометрия совпадает с брендбуком на любом размере.
 *
 * Цвет берётся из акцента темы, а не задан жёстко: в клиентском отчёте акцент
 * подменяется цветом агентства, и знак туда не попадает вовсе — но если
 * когда-нибудь попадёт, он не должен спорить с чужим брендом.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6 shrink-0", className)}>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path
        className="fill-primary-foreground"
        d="M6 6 L14 6 L14 10 L10 10 L10 22 L14 22 L14 26 L6 26 Z M26 6 L18 6 L18 10 L22 10 L22 22 L18 22 L18 26 L26 26 Z"
      />
      <circle cx="16" cy="16" r="3" className="fill-primary-foreground" />
    </svg>
  );
}
