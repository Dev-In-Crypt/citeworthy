import { ASSISTANTS } from "./catalogue";
import type { Platform } from "./types";
import { ESTIMATED_COST_PER_ANSWER_USD } from "../billing/period";
import type { PlanId } from "../billing/entitlements";
import {
  CADENCES,
  capabilitiesFor,
  monthlyAnswers,
  monthlyCheckAllowance,
  type Cadence,
  type MeasurementCapabilities,
} from "../config/measurement";

/**
 * Что тариф позволяет измерять — в виде, пригодном и для сервера, и для экрана.
 *
 * Сама политика живёт в `config/measurement.ts` и сегодня одинакова для всех
 * тарифов. Здесь она не повторяется и не уточняется: этот файл только читает
 * её и превращает в два ответа — «можно ли так» и «во что это обойдётся».
 *
 * Почему отдельный модуль, а не проверка внутри роутера: одну и ту же политику
 * применяют два места — форма расписания (не показать то, чего нельзя) и
 * `saveSchedule` (не дать сохранить то, чего нельзя). Разойдись они, агентство
 * увидело бы галочку, которую сервер молча отвергает.
 *
 * Все функции чистые и принимают возможности параметром: тариф с ограничением
 * можно проверить тестом, не трогая умолчания, которые менять нельзя.
 */

/**
 * Реэкспорт, а не второе определение: потребителю нужен один вход, а тип
 * частоты и форма возможностей остаются заданными в конфиге.
 */
export type { Cadence, MeasurementCapabilities } from "../config/measurement";

export const CADENCE_LABELS: Record<Cadence, string> = {
  biweekly: "Every two weeks",
  weekly: "Weekly",
  daily: "Daily",
};

/** Частота ли это вообще. Список берётся из конфига, а не переписывается здесь. */
export function isCadence(value: string): value is Cadence {
  return (CADENCES as readonly string[]).includes(value);
}

export type CapacityRefusalCode = "cadence" | "assistant" | "prompt-cap";

export interface CapacityRefusal {
  code: CapacityRefusalCode;
  /** Текст для человека: что именно не разрешено и что разрешено вместо этого. */
  message: string;
}

export interface ScheduleRequest {
  cadence: Cadence;
  assistants: readonly Platform[];
  /**
   * Сколько активных вопросов у клиента. Нужен только для потолка промптов;
   * потолка сегодня нет (`promptsPerClient: null`), и поле можно не передавать.
   */
  promptCount?: number;
}

function assistantLabel(id: string): string {
  return ASSISTANTS.find((assistant) => assistant.id === id)?.label ?? id;
}

function listed(items: readonly string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

/**
 * Первая причина, по которой такое расписание сохранять нельзя, или `null`.
 *
 * Возвращается именно первая, а не все: форма всё равно показывает одну
 * строку, а перечисление всех нарушений сразу читается как придирка.
 */
export function refuseSchedule(
  capabilities: MeasurementCapabilities,
  request: ScheduleRequest,
): CapacityRefusal | null {
  if (!capabilities.cadences.includes(request.cadence)) {
    return {
      code: "cadence",
      message: `${CADENCE_LABELS[request.cadence]} checks are not part of this plan. Available: ${listed(
        capabilities.cadences.map((cadence) => CADENCE_LABELS[cadence].toLowerCase()),
      )}.`,
    };
  }

  const blocked = request.assistants.filter(
    (assistant) => !capabilities.assistants.includes(assistant),
  );
  if (blocked.length > 0) {
    return {
      code: "assistant",
      message: `${listed(blocked.map(assistantLabel))} ${
        blocked.length === 1 ? "is" : "are"
      } not part of this plan. Available: ${listed(capabilities.assistants.map(assistantLabel))}.`,
    };
  }

  const cap = capabilities.promptsPerClient;
  if (cap !== null && request.promptCount !== undefined && request.promptCount > cap) {
    return {
      code: "prompt-cap",
      message: `This plan measures up to ${cap} prompts per client; this client has ${request.promptCount} active.`,
    };
  }

  return null;
}

/** То же по идентификатору тарифа — путь для роутера. */
export function refuseScheduleForPlan(
  plan: PlanId,
  request: ScheduleRequest,
): CapacityRefusal | null {
  return refuseSchedule(capabilitiesFor(plan), request);
}

export interface CapacityEstimate {
  /** Сколько ответов в месяц даст такая настройка. */
  answersPerMonth: number;
  /** Сколько проверок в месяц даёт тариф. */
  allowance: number;
  /** Доля месячного лимита, 0..1+. Больше 1 — перерасход, а не ошибка. */
  ratio: number;
  overAllowance: boolean;
  /**
   * Оценка расхода на измерение: ответы × измеренная цена ответа.
   *
   * Цена берётся из `ESTIMATED_COST_PER_ANSWER_USD` — единственной цифры
   * стоимости ответа в коде. Своих чисел здесь нет и быть не должно:
   * настоящая стоимость каждого ответа пишется в БД адаптером.
   */
  estimatedCostUsd: number;
}

export const ESTIMATE_BASIS = {
  costPerAnswerUsd: ESTIMATED_COST_PER_ANSWER_USD,
} as const;

/**
 * Во что обойдётся выбранная настройка за месяц.
 *
 * Считается до сохранения: агентство должно видеть цену выбора «давайте
 * измерять почаще» раньше, чем нажмёт «Save». Все цифры — оценка.
 */
export function estimateSchedule(input: {
  plan: PlanId;
  prompts: number;
  assistants: number;
  samplesPerPrompt: number;
  cadence: Cadence;
}): CapacityEstimate {
  const answersPerMonth = monthlyAnswers({
    prompts: input.prompts,
    assistants: input.assistants,
    samplesPerPrompt: input.samplesPerPrompt,
    cadence: input.cadence,
  });
  const allowance = monthlyCheckAllowance(input.plan);

  return {
    answersPerMonth,
    allowance,
    ratio: allowance > 0 ? answersPerMonth / allowance : 0,
    overAllowance: answersPerMonth > allowance,
    // Шесть знаков — та же точность, что у колонки cost_usd.
    estimatedCostUsd:
      Math.round(answersPerMonth * ESTIMATED_COST_PER_ANSWER_USD * 1_000_000) / 1_000_000,
  };
}

export interface CapacityOption<T extends string> {
  id: T;
  label: string;
}

export interface CapacityOptions {
  plan: PlanId;
  cadences: CapacityOption<Cadence>[];
  assistants: CapacityOption<Platform>[];
  defaultAssistants: readonly Platform[];
  promptsPerClient: number | null;
  monthlyCheckAllowance: number;
  estimatedCostPerAnswerUsd: number;
}

/**
 * Что показать в форме расписания.
 *
 * Ассистенты пересекаются с каталогом: тариф может разрешать платформу, по
 * которой адаптера ещё нет, и предлагать её галочкой нельзя — по ней не будет
 * ни одного ответа. Сегодня пересечение совпадает с `PLATFORMS`.
 */
export function capacityOptions(plan: PlanId): CapacityOptions {
  const capabilities = capabilitiesFor(plan);

  return {
    plan,
    cadences: capabilities.cadences.map((cadence) => ({
      id: cadence,
      label: CADENCE_LABELS[cadence],
    })),
    assistants: capabilities.assistants
      .filter((id) => ASSISTANTS.some((a) => a.id === id && a.measurable))
      .map((id) => ({ id, label: assistantLabel(id) })),
    defaultAssistants: capabilities.defaultAssistants,
    promptsPerClient: capabilities.promptsPerClient,
    monthlyCheckAllowance: monthlyCheckAllowance(plan),
    estimatedCostPerAnswerUsd: ESTIMATED_COST_PER_ANSWER_USD,
  };
}
