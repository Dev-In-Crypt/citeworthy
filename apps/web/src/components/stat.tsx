import { cn } from "@/lib/utils";

/**
 * Одна цифра и один бейдж уверенности — в одном месте.
 *
 * И то и другое было скопировано по экранам (карточка — трижды, бейдж —
 * четырежды), каждый раз с чуть другими отступами. Пока копий было три, это
 * стоило только аккуратности; с появлением экрана возможностей их стало бы
 * пять, и «одинаковые» цифры окончательно перестали бы выглядеть одинаково.
 *
 * Отчёт клиенту (`components/report-view.tsx`) сознательно не переведён на эти
 * компоненты: он white-label и не должен зависеть от оформления приложения.
 */

export function StatCard({
  label,
  value,
  hint,
  testId,
  size = "md",
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
  /** lg — экраны, где цифра и есть содержание (расход, план). */
  size?: "md" | "lg";
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border", size === "lg" ? "p-5" : "p-4")}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        data-testid={testId}
        className={cn(
          "metric font-semibold tracking-tight",
          size === "lg" ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * Уверенность — нейтральный бейдж, а не светофор.
 *
 * Красный на «low» читался бы как поломка, хотя это просто мало данных;
 * выделяется только low в списке клиентов, где решает, верить ли цифре вообще.
 */
export function ConfidenceBadge({
  level,
  samples,
  labelled = false,
  testId,
  className,
}: {
  level: ConfidenceLevel;
  /** Показать «· N samples» — сколько ответов стоит за уровнем. */
  samples?: number;
  /** Полная форма «Confidence: low» вместо краткой. */
  labelled?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs",
        level === "high" ? "border-client text-foreground" : "border-input text-muted-foreground",
        className,
      )}
    >
      {labelled ? `Confidence: ${level}` : level}
      {samples !== undefined && ` · ${samples} samples`}
    </span>
  );
}
