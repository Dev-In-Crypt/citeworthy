import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Плашка.
 *
 * В продукте сосуществовали две геометрии — `px-2 py-0.5 text-xs` и
 * `px-2 py-1 text-[11px]` — и восемь вариантов заливки, включая один и тот же
 * оттенок клиента на трёх разных прозрачностях в четырёх файлах. Здесь одна
 * геометрия и перечислимый набор смыслов.
 *
 * Цвет означает данные, а не украшение: зелёный — клиент, оранжевый —
 * конкуренты. Всё остальное нейтрально.
 */

export type BadgeTone = "neutral" | "muted" | "client" | "competitor" | "accent";

const TONES: Record<BadgeTone, string> = {
  neutral: "border border-input text-foreground",
  muted: "border border-input text-muted-foreground",
  client: "bg-client/15 text-foreground",
  competitor: "bg-competitor/15 text-foreground",
  accent: "bg-secondary text-muted-foreground",
};

export function Badge({
  children,
  tone = "muted",
  className,
  testId,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  testId?: string;
  title?: string;
}) {
  return (
    <span
      data-testid={testId}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
