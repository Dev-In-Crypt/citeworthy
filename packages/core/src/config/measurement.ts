import { PLAN_LIMITS } from "../billing/period";
import type { PlanId } from "../billing/entitlements";
import { DEFAULT_PLATFORMS, PLATFORM_IDS, type Platform } from "../adapters/types";

/**
 * Что тарифу разрешено измерять.
 *
 * Отдельно от `PLAN_LIMITS` намеренно: там деньги и billing unit (клиенты и
 * проверки), их менять нельзя без решения фаундера. Здесь — объём измерения:
 * сколько вопросов на клиента, как часто и каких ассистентов можно включить.
 *
 * Значения по умолчанию равны сегодняшнему поведению продукта: ничего не
 * ограничивается сверх того, что уже ограничено, и ни одно умолчание не
 * меняется. Это точка расширения, а не новая политика.
 */

export type Cadence = "daily" | "weekly" | "biweekly";

/** Все частоты, которые понимает расписание. Порядок — от редкой к частой. */
export const CADENCES: readonly Cadence[] = ["biweekly", "weekly", "daily"] as const;

export interface MeasurementCapabilities {
  /**
   * Потолок активных вопросов на клиента. `null` — потолка нет.
   *
   * Тариф и так ограничен числом проверок в месяц: вопросы × ассистенты ×
   * сэмплы × прогоны. Второй потолок поверх этого вводится только осознанно.
   */
  promptsPerClient: number | null;
  /** Частоты, которые агентство может выбрать в расписании. */
  cadences: readonly Cadence[];
  /** Ассистенты, которых тариф позволяет включить клиенту. */
  assistants: readonly Platform[];
  /** Ассистенты, включённые у нового клиента. */
  defaultAssistants: readonly Platform[];
}

/**
 * Одинаково для всех тарифов — сегодняшнее поведение.
 *
 * Разводить тарифы по объёму измерения имеет смысл вместе с решением по
 * себестоимости (см. docs/cost-model.md): на Scale расходы уже составляют
 * заметную долю цены, и ограничение частоты — один из рычагов. Пока рычаг
 * есть, но не задействован.
 */
const EVERY_PLAN: MeasurementCapabilities = {
  promptsPerClient: null,
  cadences: CADENCES,
  assistants: PLATFORM_IDS,
  defaultAssistants: DEFAULT_PLATFORMS,
};

export const MEASUREMENT_CAPABILITIES: Record<PlanId, MeasurementCapabilities> = {
  starter: EVERY_PLAN,
  growth: EVERY_PLAN,
  scale: EVERY_PLAN,
};

export function capabilitiesFor(plan: PlanId): MeasurementCapabilities {
  return MEASUREMENT_CAPABILITIES[plan] ?? EVERY_PLAN;
}

/** Разрешена ли частота на этом тарифе. */
export function allowsCadence(plan: PlanId, cadence: Cadence): boolean {
  return capabilitiesFor(plan).cadences.includes(cadence);
}

/** Разрешён ли ассистент на этом тарифе. */
export function allowsAssistant(plan: PlanId, platform: Platform): boolean {
  return capabilitiesFor(plan).assistants.includes(platform);
}

/**
 * Сколько ответов в месяц даст такая настройка.
 *
 * Считает то же, что списывается со счётчика проверок: один ответ одного
 * ассистента на один вопрос. Нужна и интерфейсу (показать цену выбора), и
 * расчёту себестоимости.
 */
export function monthlyAnswers(input: {
  prompts: number;
  assistants: number;
  samplesPerPrompt: number;
  cadence: Cadence;
}): number {
  const runsPerMonth = input.cadence === "daily" ? 30 : input.cadence === "weekly" ? 4.35 : 2.17;
  return Math.round(input.prompts * input.assistants * input.samplesPerPrompt * runsPerMonth);
}

/** Сколько проверок в месяц позволяет тариф — из денежных лимитов. */
export function monthlyCheckAllowance(plan: PlanId): number {
  return PLAN_LIMITS[plan].aiCheckAllowance;
}
