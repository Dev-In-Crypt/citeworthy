import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Пунктирная рамка «что это на самом деле значит».
 *
 * Такой блок в продукте не оформление, а обязательство: рядом с каждой цифрой
 * стоит предел, в котором её можно читать (метод измерения, недобор сэмплов,
 * «это не атрибуция причины»). Раньше он собирался руками на каждом экране,
 * и оговорка отличалась от оговорки отступом. Теперь форма одна, а текст —
 * всегда из copy-констант `@repo/core`.
 */
export function NotePanel({
  title,
  children,
  testId,
  className,
}: {
  title?: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("flex flex-col gap-1 rounded-lg border border-dashed p-4", className)}
    >
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="max-w-prose text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
