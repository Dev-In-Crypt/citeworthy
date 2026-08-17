import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Поля ввода.
 *
 * Один и тот же набор классов был выписан константой `inputClass` в пяти
 * файлах и ещё шесть раз прямо в разметке — и примерно половина полей продукта
 * при этом теряла кольцо фокуса, потому что копия оказывалась короче.
 * Выпадающие списки жили на 36 пикселях, поля — на 40, без причины.
 */

const CONTROL =
  "w-full rounded-md border border-input bg-card text-sm text-foreground " +
  "placeholder:text-muted-foreground disabled:opacity-60";

export const controlClass = CONTROL;

/** Готовая строка для полей, которые ещё не переведены на <Input>. */
export const inputClass = `${CONTROL} h-10 px-3`;

/** Подпись, поле и подсказка одним блоком — иначе они разъезжаются по экранам. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && <span className="text-sm font-medium">{label}</span>}
      {children}
      {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-10 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "p-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(CONTROL, "h-10 px-2.5", className)} {...props} />;
}
