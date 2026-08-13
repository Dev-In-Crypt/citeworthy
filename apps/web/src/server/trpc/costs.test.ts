import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  createAgency,
  createClient,
  createDb,
  createPrompt,
  createPromptCluster,
  createResponse,
  createRun,
  deleteAgency,
  listCostsByClientAndPlatform,
} from "@repo/db";
import { sumCostUsd } from "@repo/core";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/**
 * Verify T55: страница usage показывает суммы, совпадающие с SUM(cost_usd),
 * и не выдаёт чужие деньги.
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

function caller(agencyId: string, role: SessionUser["role"] = "owner") {
  const user: SessionUser = {
    id: crypto.randomUUID(),
    email: "owner@test.local",
    name: "Owner",
    agencyId,
    role,
  };
  return appRouter.createCaller({ db, user } as TrpcContext);
}

const PERIOD = "2026-05";
const IN_PERIOD = new Date("2026-05-15T12:00:00.000Z");
const BEFORE_PERIOD = new Date("2026-04-28T12:00:00.000Z");

describe("billing.costs", () => {
  let agencyId = "";
  let otherAgencyId = "";
  let acmeId = "";
  let globexId = "";

  async function addResponse(
    clientId: string,
    platform: "chatgpt" | "perplexity" | "gemini",
    costUsd: string,
    createdAt: Date,
    sampleIndex = 0,
    adaptersMode: "live" | "mock" = "live",
  ) {
    const cluster = await createPromptCluster(db, { clientId, name: `Cluster ${crypto.randomUUID()}` });
    const prompt = await createPrompt(db, {
      clusterId: cluster.id,
      text: "best CRM for startups",
    });
    const run = await createRun(db, {
      clientId,
      status: "done",
      trigger: "manual",
      adaptersMode,
    });

    return createResponse(db, {
      runId: run.id,
      promptId: prompt.id,
      platform,
      modelVersion: "mock-1",
      sampleIndex,
      rawText: "answer",
      costUsd,
      createdAt,
    });
  }

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Cost Agency", clientLimit: 10 });
    agencyId = agency.id;
    const other = await createAgency(db, { name: "Other Agency", clientLimit: 10 });
    otherAgencyId = other.id;

    acmeId = (await createClient(db, { agencyId, name: "AcmeCRM", domain: "acmecrm.test" })).id;
    globexId = (await createClient(db, { agencyId, name: "Globex", domain: "globex.test" })).id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
    await deleteAgency(db, otherAgencyId);
  });

  it("суммы совпадают с SUM(cost_usd) по клиентам и платформам", async () => {
    await addResponse(acmeId, "chatgpt", "0.004500", IN_PERIOD);
    await addResponse(acmeId, "chatgpt", "0.005500", IN_PERIOD, 1);
    await addResponse(acmeId, "perplexity", "0.002000", IN_PERIOD);
    await addResponse(globexId, "gemini", "0.010000", IN_PERIOD);

    const result = await caller(agencyId).billing.costs({ period: PERIOD });

    // Сверка с самим источником: то же, что вернёт агрегирующий запрос к БД.
    const raw = await listCostsByClientAndPlatform(
      db,
      agencyId,
      new Date("2026-05-01T00:00:00.000Z"),
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(result.totalCostUsd).toBe(sumCostUsd(raw.map((row) => row.costUsd)));

    // И с числами, посчитанными руками.
    expect(result.totalCostUsd).toBe("0.022000");
    expect(result.totalResponses).toBe(4);

    const acme = result.clients.find((row) => row.clientId === acmeId);
    expect(acme).toMatchObject({ clientName: "AcmeCRM", responses: 3, costUsd: "0.012000" });

    const acmeChatgpt = result.rows.find(
      (row) => row.clientId === acmeId && row.platform === "chatgpt",
    );
    expect(acmeChatgpt).toMatchObject({ responses: 2, costUsd: "0.010000" });
  });

  it("ответы вне периода в сумму не попадают", async () => {
    await addResponse(acmeId, "chatgpt", "0.004500", IN_PERIOD);
    await addResponse(acmeId, "chatgpt", "9.000000", BEFORE_PERIOD, 1);

    const result = await caller(agencyId).billing.costs({ period: PERIOD });

    expect(result.totalCostUsd).toBe("0.004500");
    expect(result.totalResponses).toBe(1);
  });

  it("период без измерений даёт ноль, а не ошибку", async () => {
    const result = await caller(agencyId).billing.costs({ period: PERIOD });

    expect(result.rows).toEqual([]);
    expect(result.totalCostUsd).toBe("0.000000");
  });

  it("чужие расходы не видны", async () => {
    const foreignClient = await createClient(db, {
      agencyId: otherAgencyId,
      name: "Foreign",
      domain: "foreign.test",
    });
    await addResponse(foreignClient.id, "chatgpt", "7.500000", IN_PERIOD);
    await addResponse(acmeId, "chatgpt", "0.001000", IN_PERIOD);

    const result = await caller(agencyId).billing.costs({ period: PERIOD });

    expect(result.totalCostUsd).toBe("0.001000");
    expect(result.clients.map((row) => row.clientName)).toEqual(["AcmeCRM"]);
  });

  it("прогоны на фикстурах в расход не идут, но их видно отдельно", async () => {
    await addResponse(acmeId, "chatgpt", "0.004500", IN_PERIOD);
    // Фикстурный ответ несёт цену модели, но никто её не платил: показать её
    // в расходе значило бы назвать тратой то, чего не было.
    await addResponse(acmeId, "chatgpt", "5.000000", IN_PERIOD, 1, "mock");

    const result = await caller(agencyId).billing.costs({ period: PERIOD });

    expect(result.totalCostUsd).toBe("0.004500");
    expect(result.totalResponses).toBe(1);
    expect(result.fixtureAnswers).toBe(1);
  });

  it("member до финансов агентства не допускается", async () => {
    await expect(caller(agencyId, "member").billing.costs({ period: PERIOD })).rejects.toThrow(
      TRPCError,
    );
  });
});
