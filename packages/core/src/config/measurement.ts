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
 * Ассистенты, доступные на младшем тарифе.
 *
 * Три самых дешёвых ответа: Perplexity ($0.0116), Grok ($0.0220),
 * ChatGPT ($0.0242). Дорогие — Gemini ($0.0550) и Claude ($0.0560) —
 * начинаются с Growth: разброс цены между самым дешёвым и самым дорогим
 * почти пятикратный, и на Starter он съедал бы маржу быстрее всего
 * (см. docs/cost-model.md).
 *
 * Gemini уехал со Starter не только из-за цены. Условия Google на
 * grounded-поиск запрещают хранить и анализировать результаты так, как
 * это делает продукт (docs/open-questions/gemini-grounding.md). Пока
 * вопрос не решён, чем меньше клиентов измеряется Gemini по умолчанию,
 * тем меньше цена ошибки.
 */
const STARTER_ASSISTANTS: readonly Platform[] = ["chatgpt", "perplexity", "grok"] as const;

/**
 * Ежедневный опрос — только на старшем тарифе.
 *
 * Частота самый сильный рычаг расхода: переход на еженедельный удваивает
 * число ответов, на ежедневный — умножает на 14. Именно ежедневный и
 * создаёт единственную опасную клетку модели себестоимости, поэтому он
 * и ограничен, а не что-то ещё.
 *
 * Умолчание при этом не трогается: новый клиент по-прежнему меряется раз
 * в две недели на любом тарифе.
 */
const WITHOUT_DAILY: readonly Cadence[] = ["biweekly", "weekly"] as const;

const ALL_ASSISTANTS: MeasurementCapabilities = {
  promptsPerClient: null,
  cadences: CADENCES,
  assistants: PLATFORM_IDS,
  defaultAssistants: DEFAULT_PLATFORMS,
};

/**
 * Что тариф разрешает включить.
 *
 * Частоты и потолок вопросов пока одинаковы у всех: решение по ним ещё не
 * принято, и разводить их «заодно» значило бы менять поведение без
 * причины. Разведены только ассистенты.
 */
export const MEASUREMENT_CAPABILITIES: Record<PlanId, MeasurementCapabilities> = {
  starter: {
    promptsPerClient: null,
    cadences: WITHOUT_DAILY,
    assistants: STARTER_ASSISTANTS,
    // Умолчание не может предлагать то, чего тариф не разрешает.
    defaultAssistants: STARTER_ASSISTANTS,
  },
  growth: { ...ALL_ASSISTANTS, cadences: WITHOUT_DAILY },
  scale: ALL_ASSISTANTS,
};

export function capabilitiesFor(plan: PlanId): MeasurementCapabilities {
  // Неизвестный тариф трактуется как младший: ошибка в сторону меньшего
  // расхода, а не большего.
  return MEASUREMENT_CAPABILITIES[plan] ?? MEASUREMENT_CAPABILITIES.starter;
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
