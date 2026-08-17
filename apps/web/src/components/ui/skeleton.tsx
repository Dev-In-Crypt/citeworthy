import { cn } from "@/lib/utils";

/**
 * Загрузка.
 *
 * В восемнадцати местах продукт печатал голое «Loading…» вместо целого экрана:
 * рамка страницы исчезала, а через секунду появлялась обратно вместе с
 * данными. Каркас должен оставаться на месте — двигаться должно только то,
 * чего ещё нет.
 *
 * Форма скелета повторяет форму содержимого, которое встанет на его место.
 * Иначе он не подготавливает к появлению данных, а просто мигает.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted-foreground/12", className)}
    />
  );
}

/** Несколько строк текста. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/5" : index % 2 ? "w-4/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Несколько карточек в столбец — самая частая форма в этом продукте. */
export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/** Строки таблицы. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}
