import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  createAgency,
  createClient,
  createDb,
  createPrompt,
  createPromptCluster,
  deleteAgency,
} from "@repo/db";
import { DEFAULT_PLATFORMS, PLAN_LIMITS, PLATFORM_IDS } from "@repo/core";
import { CADENCES, capabilitiesFor } from "@repo/core/config/measurement";
import { refuseSchedule } from "@repo/core/adapters/capacity";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext, UserRole } from "./context";
import type { Database } from "@repo/db";

/**
 * Ёмкость измерения приходит из конфига, а не из литералов в роутере.
 *
 * Главное утверждение — сегодняшнее поведение не изменилось: конфиг разрешает
 * всё, и ни одна настройка, которая сохранялась раньше, не перестала
 * сохраняться. Сам запрет проверяется отдельно, чистой функцией на урезанных
 * возможностях: умолчания тарифов трогать нельзя.
 *
 * Требует поднятой БД (docker compose up -d && pnpm db:migrate).
 */

const { db, close } = createDb();

function contextFor(user: SessionUser | null): TrpcContext {
  return { db: db as Database, user };
}

function userIn(agencyId: string, role: UserRole = "owner"): SessionUser {
  return { id: crypto.randomUUID(), email: `${role}@test.local`, name: "Test", agencyId, role };
}

describe("ёмкость расписания", () => {
  let agencyId = "";
  let clientId = "";

  beforeAll(async () => {
    const agency = await createAgency(db, { name: "Capacity Agency", clientLimit: 10 });
    agencyId = agency.id;

    const client = await createClient(db, {
      agencyId,
      name: "Capacity Client",
      domain: "capacity.test",
    });
    clientId = client.id;

    const cluster = await createPromptCluster(db, {
      clientId,
      name: "CRM comparison",
      intent: "comparison",
    });
    for (const text of ["best crm for startups", "crm with good api", "cheapest crm"]) {
      await createPrompt(db, { clusterId: cluster.id, text, isControl: false });
    }
  });

  afterAll(async () => {
    await deleteAgency(db, agencyId);
    await close();
  });

  it("отдаёт разрешённые частоты и ассистентов, а не свой список", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));
    const capacity = await caller.runs.capacity({ clientId });

    // Агентство без подписки работает на starter — это умолчание продукта.
    expect(capacity.cadences.map((c) => c.id)).toEqual([...CADENCES]);
    expect(capacity.assistants.map((a) => a.id)).toEqual([...PLATFORM_IDS]);
    expect(capacity.monthlyCheckAllowance).toBe(PLAN_LIMITS[capacity.plan].aiCheckAllowance);
    expect(capacity.defaultAssistants).toEqual([...DEFAULT_PLATFORMS]);
    expect(capacity.promptsPerClient).toBeNull();
  });

  it("считает активные вопросы клиента — множитель оценки", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));
    const capacity = await caller.runs.capacity({ clientId });

    expect(capacity.promptCount).toBe(3);
  });

  it("цена ответа берётся из кода, а не назначается экраном", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));
    const capacity = await caller.runs.capacity({ clientId });

    expect(capacity.estimatedCostPerAnswerUsd).toBeGreaterThan(0);
  });

  it("чужому клиенту ёмкость не показывается", async () => {
    const other = await createAgency(db, { name: "Other Agency", clientLimit: 10 });
    const caller = appRouter.createCaller(contextFor(userIn(other.id)));

    await expect(caller.runs.capacity({ clientId })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
      "ожидался TRPCError с кодом NOT_FOUND",
    );

    await deleteAgency(db, other.id);
  });

  it.each([...CADENCES])("частота %s сохраняется как и раньше", async (cadence) => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));

    const saved = await caller.runs.saveSchedule({
      clientId,
      cadence,
      platforms: [...DEFAULT_PLATFORMS],
      samplesPerPrompt: 3,
      active: true,
    });

    expect(saved.cadence).toBe(cadence);
  });

  it("сохраняются все ассистенты сразу — тариф сегодня не ограничивает", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));

    const saved = await caller.runs.saveSchedule({
      clientId,
      cadence: "biweekly",
      platforms: [...PLATFORM_IDS],
      samplesPerPrompt: 3,
      active: true,
    });

    expect(saved.platforms).toEqual([...PLATFORM_IDS]);
  });

  it("умолчание расписания осталось biweekly и запускная тройка", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));
    const capacity = await caller.runs.capacity({ clientId });

    expect(capacity.cadences[0]?.id).toBe("biweekly");
    expect(capacity.defaultAssistants).toEqual([...DEFAULT_PLATFORMS]);
  });

  it("незнакомая частота отвергается входной схемой", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyId)));

    await expect(
      caller.runs.saveSchedule({
        clientId,
        // Значение, которого нет в конфиге: расписание не должно его принять.
        cadence: "hourly" as never,
        platforms: [...DEFAULT_PLATFORMS],
        samplesPerPrompt: 3,
        active: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
      "ожидался TRPCError с кодом BAD_REQUEST",
    );
  });

  it("запрет тарифа объясняется словами — та же функция, что и в роутере", () => {
    // Роутер отдаёт message отказа как есть, поэтому проверять текст можно
    // на чистой функции с урезанными возможностями: умолчания при этом целы.
    const refusal = refuseSchedule(
      { ...capabilitiesFor("starter"), cadences: ["biweekly"] },
      { cadence: "daily", assistants: [...DEFAULT_PLATFORMS] },
    );

    expect(refusal?.code).toBe("cadence");
    expect(refusal?.message).toMatch(/not part of this plan/);
    expect(capabilitiesFor("starter").cadences).toEqual([...CADENCES]);
  });
});
