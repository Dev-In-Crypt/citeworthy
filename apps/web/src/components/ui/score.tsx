import { cn } from "@/lib/utils";

/**
 * Оценка возможности.
 *
 * Число без шкалы ничего не сообщает: 64 — это много или мало? Поэтому рядом
 * всегда стоит «/100» и полоса. Полоса важнее, чем кажется: список читают
 * сверху вниз, и глазу нужен ритм, а не колонка цифр.
 *
 * Цвет здесь один — акцентный. Раскрасить оценку по светофору значило бы
 * сказать «красное — плохо», а плохо не бывает: бывает «за это браться
 * первым».
 */
export function ScoreDial({
  score,
  size = "md",
  testId,
  className,
}: {
  score: number;
  size?: "sm" | "md";
  testId?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 flex-col gap-1", size === "md" ? "w-14" : "w-11", className)}>
      <span className="flex items-baseline gap-0.5">
        <span
          data-testid={testId}
          className={cn(
            "metric leading-none font-semibold tracking-tight",
            size === "md" ? "text-2xl" : "text-lg",
          )}
        >
          {score}
        </span>
        <span className="metric text-xs text-muted-foreground">/100</span>
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/15">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </span>
    </span>
  );
}
