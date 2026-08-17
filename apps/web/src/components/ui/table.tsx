import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Таблица.
 *
 * Шесть таблиц продукта повторяли одну форму с мелкими расхождениями: где-то
 * `py-2`, где-то `py-2.5`, где-то модификаторы висели на `thead`, где-то на
 * строке заголовка. Половина из них не была обёрнута в прокрутку и на узком
 * экране растягивала страницу.
 *
 * Обёртка с прокруткой здесь обязательная часть компонента, а не то, о чём
 * нужно вспомнить: широкая таблица должна ехать внутри себя, а не тащить
 * за собой всю страницу.
 */

export function Table({
  children,
  minWidth,
  testId,
  className,
}: {
  children: ReactNode;
  /** Ниже этой ширины таблица прокручивается внутри себя. */
  minWidth?: number;
  testId?: string;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        data-testid={testId}
        className={cn("w-full text-sm", className)}
        style={minWidth ? { minWidth: `${minWidth}px` } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="text-left text-muted-foreground">
      <tr className="border-b">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "py-2 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b last:border-0", className)} {...props} />;
}

export function TD({
  children,
  align = "left",
  numeric = false,
  className,
  ...props
}: ComponentProps<"td"> & { align?: "left" | "right" | "center"; numeric?: boolean }) {
  return (
    <td
      className={cn(
        "py-2.5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        // Цифры моноширинные всегда: иначе колонка дёргается при обновлении.
        numeric && "metric",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}
