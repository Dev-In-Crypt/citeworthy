import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Кнопка.
 *
 * До неё в продукте было 38 мест с главной кнопкой в десяти разных вариантах
 * строки классов и 28 второстепенных в дюжине: три высоты, четыре отступа,
 * половина без hover, половина без disabled. Часть кнопок оказывалась во всю
 * ширину не по решению, а потому что кто-то забыл `px-4`.
 *
 * И ни у одной из них не было стиля фокуса. По продукту ходят с клавиатуры;
 * потерянный фокус означает, что человек не понимает, где он. Кольцо задано
 * глобально в globals.css, а здесь — только форма.
 */

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
  "transition-colors disabled:pointer-events-none disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
  outline: "border border-input bg-card text-foreground hover:bg-accent active:bg-accent",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  danger: "border border-input text-destructive hover:bg-destructive/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-10 px-4 text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "lg",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = Omit<ComponentProps<"button">, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function Button({ variant, size, className, type, ...props }: ButtonProps) {
  return <button type={type ?? "button"} className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

/**
 * Та же кнопка, но ссылка. Отдельный компонент, а не проп `as`: у ссылки свой
 * набор атрибутов, и типизированные роуты Next проверяют href только у Link.
 */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
