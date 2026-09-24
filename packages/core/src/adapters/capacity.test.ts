import { describe, expect, it } from "vitest";
import {
  CADENCE_LABELS,
  capacityOptions,
  type CapabilitiesLookup,
  estimateSchedule,
  isCadence,
  refuseSchedule,
  refuseScheduleForPlan,
} from "./capacity";
import { DEFAULT_PLATFORMS, PLATFORM_IDS } from "./types";
import { ESTIMATED_COST_PER_ANSWER_USD, PLAN_LIMITS } from "../billing/period";
import {
  CADENCES,
  capabilitiesFor,
  monthlyAnswers,
  type Cadence,
  type MeasurementCapabilities,
} from "../config/measurement";
import type { PlanId } from "../billing/entitlements";

/**
 * Два разных утверждения, и их нельзя путать.
 *
 * 1. Сегодняшнее поведение не изменилось: конфиг разрешает всё, и ни один
 *    тариф ничего не отвергает. Это защита от «незаметно ограничили продукт».
 * 2. Ограничение работает, если его задать. Проверяется на выдуманных
 *    возможностях, передаваемых в чистую функцию, — умолчания при этом
 *    остаются нетронутыми (их менять нельзя без решения фаундера).
 */

const PLANS = Object.keys(PLAN_LIMITS) as PlanId[];

describe("сегодняшняя политика тарифов", () => {
  const STARTER_THREE = ["chatgpt", "perplexity", "grok"] as const;

  it.each(PLANS)("тариф %s разрешает опрос раз в две недели и раз в неделю", (plan) => {
    for (const cadence of ["biweekly", "weekly"] as const) {
      expect(refuseScheduleForPlan(plan, { cadence, assistants: STARTER_THREE })).toBeNull();
    }
  });

  it("ежедневный опрос доступен только на scale", () => {
    // Частота — самый сильный рычаг расхода: ×2 при недельном, ×14 при
    // ежедневном. Единственная опасная клетка модели себестоимости
    // создаётся именно им.
    expect(
      refuseScheduleForPlan("scale", { cadence: "daily", assistants: STARTER_THREE }),
    ).toBeNull();

    for (const plan of ["starter", "growth"] as const) {
      const refusal = refuseScheduleForPlan(plan, {
        cadence: "daily",
        assistants: STARTER_THREE,
      });

      expect(refusal?.code, `${plan} не должен давать ежедневный опрос`).toBe("cadence");
      // Отказ называет, что доступно взамен.
      expect(refusal?.message).toContain("every two weeks");
    }
  });

  it.each(PLANS)("у тарифа %s нет потолка промптов", (plan) => {
    expect(capabilitiesFor(plan).promptsPerClient).toBeNull();
  });

  it("умолчание частоты осталось biweekly", () => {
    // Каденс — самый сильный рычаг расхода (×14 при daily). Менять его
    // умолчание можно только решением фаундера.
    expect(CADENCES[0]).toBe("biweekly");
  });

  it("starter даёт три самых дешёвых ассистента", () => {
    // Разброс цены ответа между самым дешёвым и самым дорогим почти
    // пятикратный, и на младшем тарифе он съедал бы маржу быстрее всего.
    expect(capabilitiesFor("starter").assistants).toEqual([...STARTER_THREE]);
    expect(
      refuseScheduleForPlan("starter", { cadence: "biweekly", assistants: STARTER_THREE }),
    ).toBeNull();
  });

  it("starter отказывает в дорогих ассистентах и называет их", () => {
    for (const assistant of ["gemini", "claude"] as const) {
      const refusal = refuseScheduleForPlan("starter", {
        cadence: "biweekly",
        assistants: [assistant],
      });

      expect(refusal?.code, `${assistant} должен быть заперт на starter`).toBe("assistant");
      // В отказе названы и запертый, и то, что взамен доступно.
      expect(refusal?.message).toContain(assistant === "gemini" ? "Gemini" : "Claude");
      expect(refusal?.message).toContain("ChatGPT");
    }
  });

  it.each(["growth", "scale"] as const)("тариф %s даёт всех", (plan) => {
    expect(
      refuseScheduleForPlan(plan, { cadence: "biweekly", assistants: PLATFORM_IDS }),
    ).toBeNull();
  });

  it("умолчание каждого тарифа помещается в то, что он разрешает", () => {
    // Иначе новый клиент заводился бы с ассистентом, которого тариф не
    // даёт, и первое же сохранение расписания упиралось бы в отказ.
    for (const plan of PLANS) {
      const { assistants, defaultAssistants } = capabilitiesFor(plan);
      for (const id of defaultAssistants) {
        expect(assistants, `${plan}: умолчание вне разрешённого`).toContain(id);
      }
    }
  });

  it("на growth и scale умолчание прежнее", () => {
    for (const plan of ["growth", "scale"] as const) {
      expect(capacityOptions(plan).defaultAssistants).toEqual(DEFAULT_PLATFORMS);
    }
  });
});

describe("ограничение работает, если его задать", () => {
  const weeklyOnly: MeasurementCapabilities = {
    promptsPerClient: 24,
    cadences: ["biweekly", "weekly"],
    assistants: ["chatgpt", "perplexity"],
    defaultAssistants: ["chatgpt"],
  };

  it("запрещённая частота отвергается с названием разрешённых", () => {
    const refusal = refuseSchedule(weeklyOnly, {
      cadence: "daily",
      assistants: ["chatgpt"],
    });

    expect(refusal?.code).toBe("cadence");
    expect(refusal?.message).toContain("Daily");
    expect(refusal?.message).toContain("weekly");
  });

  it("разрешённая частота проходит", () => {
    expect(refuseSchedule(weeklyOnly, { cadence: "weekly", assistants: ["chatgpt"] })).toBeNull();
  });

  it("запрещённый ассистент отвергается и назван по имени", () => {
    const refusal = refuseSchedule(weeklyOnly, {
      cadence: "weekly",
      assistants: ["chatgpt", "gemini"],
    });

    expect(refusal?.code).toBe("assistant");
    expect(refusal?.message).toContain("Gemini");
    expect(refusal?.message).not.toContain("ChatGPT is not");
  });

  it("несколько запрещённых ассистентов перечисляются вместе", () => {
    const refusal = refuseSchedule(weeklyOnly, {
      cadence: "weekly",
      assistants: ["gemini", "claude"],
    });

    expect(refusal?.code).toBe("assistant");
    expect(refusal?.message).toContain("Gemini");
    expect(refusal?.message).toContain("Claude");
    expect(refusal?.message).toContain("are not part of this plan");
  });

  it("потолок промптов срабатывает только при превышении", () => {
    const within = refuseSchedule(weeklyOnly, {
      cadence: "weekly",
      assistants: ["chatgpt"],
      promptCount: 24,
    });
    const over = refuseSchedule(weeklyOnly, {
      cadence: "weekly",
      assistants: ["chatgpt"],
      promptCount: 25,
    });

    expect(within).toBeNull();
    expect(over?.code).toBe("prompt-cap");
    expect(over?.message).toContain("24");
    expect(over?.message).toContain("25");
  });

  it("частота проверяется раньше ассистентов: одна причина за раз", () => {
    const refusal = refuseSchedule(weeklyOnly, {
      cadence: "daily",
      assistants: ["gemini"],
    });

    expect(refusal?.code).toBe("cadence");
  });

  it("форма предлагает ровно то, что разрешено", () => {
    // Через тот же чистый путь, что и `capacityOptions`, но на урезанных
    // возможностях: сам `capacityOptions` ходит в конфиг, менять который нельзя.
    expect(weeklyOnly.cadences.map((c) => CADENCE_LABELS[c])).toEqual([
      "Every two weeks",
      "Weekly",
    ]);
  });
});

describe("что предлагается в форме", () => {
  it.each(PLANS)("тариф %s предлагает только измеряемых ассистентов", (plan) => {
    const options = capacityOptions(plan);

    expect(options.assistants.map((a) => a.id)).toEqual([...PLATFORM_IDS]);
    // Copilot и AI Overviews не измеряются — в расписании их быть не может.
    expect(options.assistants.map((a) => a.id)).not.toContain("copilot");
    expect(options.assistants.map((a) => a.id)).not.toContain("ai-overviews");
  });

  it.each(PLANS)("тариф %s отдаёт свой месячный лимит проверок", (plan) => {
    expect(capacityOptions(plan).monthlyCheckAllowance).toBe(PLAN_LIMITS[plan].aiCheckAllowance);
  });

  it("цена ответа берётся из единственной константы в коде", () => {
    expect(capacityOptions("growth").estimatedCostPerAnswerUsd).toBe(
      ESTIMATED_COST_PER_ANSWER_USD,
    );
  });

  it("частоты идут от редкой к частой: первая — умолчание", () => {
    // Порядок важен: первая в списке становится выбранной в форме, и это
    // должен быть самый дешёвый вариант, а не самый частый.
    expect(capacityOptions("scale").cadences.map((c) => c.id)).toEqual([
      "biweekly",
      "weekly",
      "daily",
    ]);
    expect(capacityOptions("starter").cadences.map((c) => c.id)).toEqual(["biweekly", "weekly"]);
  });
});

describe("оценка расхода", () => {
  const setting = { prompts: 24, assistants: 3, samplesPerPrompt: 3 };

  it("ответов в месяц — ровно столько, сколько считает конфиг", () => {
    for (const cadence of CADENCES) {
      const estimate = estimateSchedule({ plan: "growth", cadence, ...setting });
      expect(estimate.answersPerMonth).toBe(monthlyAnswers({ ...setting, cadence }));
    }
  });

  it("частота — главный рычаг: недельная вдвое дороже, дневная на порядок", () => {
    const biweekly = estimateSchedule({ plan: "growth", cadence: "biweekly", ...setting });
    const weekly = estimateSchedule({ plan: "growth", cadence: "weekly", ...setting });
    const daily = estimateSchedule({ plan: "growth", cadence: "daily", ...setting });

    expect(weekly.answersPerMonth / biweekly.answersPerMonth).toBeCloseTo(2, 1);
    expect(daily.answersPerMonth / weekly.answersPerMonth).toBeCloseTo(6.9, 1);
  });

  it("расход — ответы × измеренная цена ответа, без своих чисел", () => {
    const estimate = estimateSchedule({ plan: "growth", cadence: "weekly", ...setting });

    expect(estimate.estimatedCostUsd).toBeCloseTo(
      estimate.answersPerMonth * ESTIMATED_COST_PER_ANSWER_USD,
      6,
    );
  });

  it("обычная настройка укладывается в лимит любого тарифа", () => {
    for (const plan of PLANS) {
      const estimate = estimateSchedule({ plan, cadence: "weekly", ...setting });
      expect(estimate.overAllowance).toBe(false);
      expect(estimate.ratio).toBeLessThan(1);
    }
  });

  it("перерасход виден до сохранения, а не после", () => {
    const estimate = estimateSchedule({
      plan: "starter",
      prompts: 60,
      assistants: 5,
      samplesPerPrompt: 5,
      cadence: "daily",
    });

    expect(estimate.answersPerMonth).toBe(45_000);
    expect(estimate.allowance).toBe(PLAN_LIMITS.starter.aiCheckAllowance);
    expect(estimate.overAllowance).toBe(true);
    expect(estimate.ratio).toBeGreaterThan(1);
  });

  it("пустая настройка не делит на ноль", () => {
    const estimate = estimateSchedule({
      plan: "starter",
      prompts: 0,
      assistants: 0,
      samplesPerPrompt: 3,
      cadence: "weekly",
    });

    expect(estimate.answersPerMonth).toBe(0);
    expect(estimate.estimatedCostUsd).toBe(0);
    expect(estimate.overAllowance).toBe(false);
  });
});

describe("разбор частоты", () => {
  it.each([...CADENCES])("%s — известная частота", (cadence) => {
    expect(isCadence(cadence)).toBe(true);
  });

  it.each(["hourly", "monthly", "", "BIWEEKLY"])("%s — нет", (value) => {
    expect(isCadence(value)).toBe(false);
  });

  it("у каждой известной частоты есть подпись", () => {
    for (const cadence of CADENCES) {
      expect(CADENCE_LABELS[cadence as Cadence]).toBeTruthy();
    }
  });
});

describe("ассистенты в форме расписания", () => {
  it("показываются все измеримые, а не только разрешённые тарифом", () => {
    // Спрятанный ассистент — это ассистент, о котором агентство не узнает.
    const ids = capacityOptions("starter").assistants.map((a) => a.id);

    for (const id of ["chatgpt", "perplexity", "gemini", "claude", "grok"]) {
      expect(ids).toContain(id);
    }
  });

  it("неизмеримая поверхность в список не попадает", () => {
    // По ней нет адаптера: галочка обещала бы измерение, которого не будет.
    const ids = capacityOptions("scale").assistants.map((a) => a.id);
    expect(ids).not.toContain("copilot");
  });

  it("на starter дорогие видны, но заперты и подписаны тарифом", () => {
    const assistants = capacityOptions("starter").assistants;

    for (const id of ["gemini", "claude"] as const) {
      const locked = assistants.find((a) => a.id === id);
      expect(locked?.allowed, `${id} должен быть заперт`).toBe(false);
      expect(locked?.unlocksOn).toBe("growth");
    }

    for (const id of ["chatgpt", "perplexity", "grok"] as const) {
      expect(assistants.find((a) => a.id === id)?.allowed).toBe(true);
    }
  });

  it("на growth и scale запертых нет", () => {
    for (const plan of ["growth", "scale"] as const) {
      for (const assistant of capacityOptions(plan).assistants) {
        expect(assistant.allowed).toBe(true);
        expect(assistant.unlocksOn).toBeUndefined();
      }
    }
  });

  it("запертый называет тариф, на котором включается", () => {
    // Проверка на подменённом конфиге: сегодня тарифы не разведены, но
    // рычаг обязан работать в тот день, когда их разведут — иначе на
    // экране появится серая галочка без объяснения.
    const restricted: CapabilitiesLookup = (plan) =>
      plan === "starter"
        ? { ...capabilitiesFor(plan), assistants: ["chatgpt", "perplexity", "grok"] }
        : capabilitiesFor(plan);

    const assistants = capacityOptions("starter", restricted).assistants;
    const claude = assistants.find((a) => a.id === "claude");
    const chatgpt = assistants.find((a) => a.id === "chatgpt");

    // Запертый виден, выключен и подписан самым дешёвым подходящим тарифом.
    expect(claude?.allowed).toBe(false);
    expect(claude?.unlocksOn).toBe("growth");
    // Разрешённый подписи не несёт: «доступно на starter» на starter — шум.
    expect(chatgpt?.allowed).toBe(true);
    expect(chatgpt?.unlocksOn).toBeUndefined();
  });
});
