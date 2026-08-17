import type { LucideIcon } from "lucide-react";
import { Telescope } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Пустое состояние с CTA — обязательный элемент каждого экрана
 * (IMPLEMENTATION_PLAN.md §4.3).
 *
 * Оно здесь работает: у продукта, который начинает с нуля измерений, пустой
 * экран — это первое, что видит новое агентство, и он обязан объяснять, чего
 * не хватает и что нажать. Раньше это был текст, притиснутый к левому краю
 * пунктирной рамки; выравнивание по центру и знак сверху делают из него блок,
 * который читается как состояние, а не как забытая подпись.
 *
 * Текст не меняется: заголовки пустых состояний проверяются сквозными тестами
 * и, что важнее, они уже написаны честно — «данных пока нет» вместо «ошибка».
 */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Telescope,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
