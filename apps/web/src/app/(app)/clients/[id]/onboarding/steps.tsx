"use client";

import { ESTIMATED_COST_PER_ANSWER_USD, measurableAssistants } from "@repo/core";
import { cn } from "@/lib/utils";

/**
 * Шаги заведения клиента.
 *
 * Показаны целиком, а не по одному: человек, заводящий клиента, должен
 * заранее знать, что после списка вопросов будет расписание, — иначе он
 * бросает продукт на середине, считая, что всё готово.
 */

const STEPS = ["Client", "Prompts & competitors", "Schedule"] as const;

export function OnboardingSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
        {current} of {STEPS.length}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
        {STEPS.map((step, index) => (
          <span key={step} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden>·</span>}
            <span className={cn(index + 1 === current && "font-medium text-foreground")}>
              {step}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * Цена расписания до того, как его сохранили.
 *
 * Продукт тратит деньги агентства на каждый ответ, и сумма должна стоять
 * рядом с настройкой, которая её определяет, а не всплывать в конце месяца
 * на странице расходов.
 */
export function SamplingCost({
  prompts,
  samplesPerPrompt = 3,
  runsPerMonth = 2,
}: {
  prompts: number;
  samplesPerPrompt?: number;
  runsPerMonth?: number;
}) {
  const assistants = measurableAssistants().length;
  const perRun = prompts * assistants * samplesPerPrompt;
  const perMonth = perRun * runsPerMonth;
  const costPerMonth = perMonth * ESTIMATED_COST_PER_ANSWER_USD;

  if (prompts === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        Save a prompt set to see what a schedule will cost.
      </span>
    );
  }

  return (
    <span data-testid="sampling-cost" className="metric text-sm text-muted-foreground">
      {prompts} prompts × {assistants} assistants × {samplesPerPrompt} samples ={" "}
      <span className="font-medium text-foreground">{perRun} answers</span> per run · about $
      {costPerMonth.toFixed(2)} a month at the default cadence
    </span>
  );
}
