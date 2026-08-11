/**
 * Биллинговый период — календарный месяц в UTC.
 *
 * Именно UTC, а не локальная зона: агентства в разных часовых поясах,
 * и период должен считаться одинаково у воркера, API и в отчёте.
 */
export function billingPeriod(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Границы периода: [начало, конец) в UTC. */
export function billingPeriodBounds(period: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) {
    throw new Error(`Invalid billing period "${period}". Expected YYYY-MM.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid billing period "${period}". Month must be 01-12.`);
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/** Планы и их лимиты. Цены — из спека (§13 startup-spec). */
export interface PlanLimits {
  clientLimit: number;
  aiCheckAllowance: number;
  priceUsd: number;
}

export const PLAN_LIMITS: Record<"starter" | "growth" | "scale", PlanLimits> = {
  starter: { clientLimit: 3, aiCheckAllowance: 6_000, priceUsd: 499 },
  growth: { clientLimit: 10, aiCheckAllowance: 25_000, priceUsd: 1_299 },
  scale: { clientLimit: 25, aiCheckAllowance: 70_000, priceUsd: 2_499 },
};

export interface UsageStatus {
  used: number;
  allowance: number;
  /** Доля израсходованного, 0..1+ (может превысить 1 — это overage, а не ошибка). */
  ratio: number;
  overAllowance: boolean;
}

export function usageStatus(used: number, allowance: number): UsageStatus {
  const ratio = allowance > 0 ? used / allowance : 0;
  return { used, allowance, ratio, overAllowance: used > allowance };
}
