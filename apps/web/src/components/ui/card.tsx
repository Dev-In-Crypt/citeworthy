import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Карточка.
 *
 * Базовая форма встречалась в продукте 60 раз с четырьмя разными отступами и
 * тремя разными внутренними промежутками — визуально это одна и та же
 * карточка, а выглядела она каждый раз чуть иначе.
 *
 * Фон здесь `bg-card`, а не прозрачный: страница теперь чуть темнее карточки,
 * и глубина берётся из этой разницы, а не из тени.
 */

export function Card({
  className,
  dashed = false,
  padding = "md",
  ...props
}: ComponentProps<"div"> & { dashed?: boolean; padding?: "sm" | "md" | "lg" | "none" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        dashed && "border-dashed bg-transparent",
        padding === "sm" && "p-3",
        padding === "md" && "p-4",
        padding === "lg" && "p-5",
        className,
      )}
      {...props}
    />
  );
}

/** Заголовок раздела внутри карточки. Один размер на весь продукт. */
export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-sm font-medium", className)}>{children}</h2>;
}
