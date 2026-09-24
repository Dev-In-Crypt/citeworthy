import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgency,
  createClient,
  createDb,
  createResponse,
  createRun,
  databaseNow,
  deleteAgency,
  getClientById,
  replaceMentions,
} from "@repo/db";
import { promptClusters, prompts } from "@repo/db/schema/measurement";
import { clientVisibility } from "./read-models";

/**
 * Выключенный ассистент не должен выглядеть как результат работы агентства.
 *
 * Доля считается от тех ответов, что есть. Уберите ассистента, в котором
 * клиента не называли, — и доля вырастет сама собой, без единого изменения
 * у клиента. Причём вырастет заметно, и проверка «отличимо ли это от шума»
 * такой сдвиг подтвердит: интервалы не пересекутся. Именно поэтому дело не
 * сводится к приписке — сравнивать надо по общей части наборов.
 *
 * Проверяется на настоящей базе, а не на числах в памяти: состав периода
 * выводится из записанных ответов, и ошибка в этом выводе не видна в
 * чистых функциях.
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

describe("смена состава ассистентов между окнами", () => {
  let agencyId = "";
  let clientId = "";
  let promptId = "";
  let now = new Date();

  beforeEach(async () => {
    now = await databaseNow(db);

    agencyId = (await createAgency(db, { name: "Basis Agency", clientLimit: 10 })).id;
    const client = await createClient(db, {
      agencyId,
      name: "Ledgerbrook",
      domain: "ledgerbrook.test",
      brandNames: ["Ledgerbrook"],
      competitorNames: ["Outlay"],
    });
    clientId = client.id;

    const clusterId = (
      await db
        .insert(promptClusters)
        .values({ clientId, name: "Expense", intent: "comparison" })
        .returning()
    )[0]!.id;

    promptId = (
      await db
        .insert(prompts)
        .values({ clusterId, text: "best expense management software" })
        .returning()
    )[0]!.id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  /**
   * Ответы одной платформы в заданном окне.
   *
   * Время ставится явно, а не `defaultNow()`: окно у теста своё, и попасть
   * в него надо намеренно, а не надеяться, что вставка успеет.
   */
  async function addAnswers(input: {
    platform: "chatgpt" | "claude";
    daysAgo: number;
    total: number;
    named: number;
  }): Promise<void> {
    const run = await createRun(db, {
      clientId,
      scheduleId: null,
      trigger: "manual",
      adaptersMode: "live",
    });
    const at = new Date(now.getTime() - input.daysAgo * 86_400_000);

    for (let index = 0; index < input.total; index++) {
      const response = await createResponse(db, {
        runId: run.id,
        promptId,
        platform: input.platform,
        modelVersion: `${input.platform}-test`,
        sampleIndex: index,
        rawText: index < input.named ? "Ledgerbrook is a common pick." : "Outlay is a common pick.",
        costUsd: "0.024500",
        createdAt: at,
      });

      await replaceMentions(db, response.id, [
        index < input.named
          ? {
              responseId: response.id,
              entityType: "client",
              entityName: "Ledgerbrook",
              position: 1,
              isClient: true,
            }
          : {
              responseId: response.id,
              entityType: "competitor",
              entityName: "Outlay",
              position: 1,
              isCompetitor: true,
            },
      ]);
    }
  }

  async function visibility() {
    const client = (await getClientById(db, clientId))!;
    return clientVisibility(db, client);
  }

  it("выключенный ассистент не превращается в рост", async () => {
    // Прошлое окно: ChatGPT называет клиента в трети ответов, Claude — ни разу.
    await addAnswers({ platform: "chatgpt", daysAgo: 40, total: 30, named: 10 });
    await addAnswers({ platform: "claude", daysAgo: 40, total: 30, named: 0 });
    // Текущее окно: Claude выключили, ChatGPT отвечает ровно так же.
    await addAnswers({ platform: "chatgpt", daysAgo: 5, total: 30, named: 10 });

    const result = await visibility();

    // Видимость показывается по всему, что измерено сейчас, — это правда.
    expect(result.totals.ratePct).toBeCloseTo(33.3, 1);
    // А изменение — по общей части. У клиента не изменилось ничего.
    expect(result.totalsDeltaPp).toBe(0);
    expect(result.assistantBasis.verdict).toBe("narrowed");
    expect(result.assistantBasis.dropped).toEqual(["claude"]);
    expect(result.assistantBasis.shared).toEqual(["chatgpt"]);
    expect(result.assistantBasisNote).toContain("ChatGPT");
  });

  it("одинаковый состав не получает никакой приписки", async () => {
    await addAnswers({ platform: "chatgpt", daysAgo: 40, total: 30, named: 6 });
    await addAnswers({ platform: "chatgpt", daysAgo: 5, total: 30, named: 12 });

    const result = await visibility();

    expect(result.assistantBasis.verdict).toBe("same");
    expect(result.assistantBasisNote).toBeNull();
    // Настоящий рост остаётся на месте: чинится ложный, а не всякий.
    expect(result.totalsDeltaPp).toBe(20);
  });

  it("без общих ассистентов изменение не показывается вовсе", async () => {
    await addAnswers({ platform: "claude", daysAgo: 40, total: 30, named: 30 });
    await addAnswers({ platform: "chatgpt", daysAgo: 5, total: 30, named: 0 });

    const result = await visibility();

    expect(result.assistantBasis.verdict).toBe("disjoint");
    // Ноль означал бы «не изменилось»; сравнивать было нечем.
    expect(result.totalsDeltaPp).toBeNull();
    expect(result.totalsDistinguishable).toBe(false);
  });

  it("включённый ассистент тоже не считается ростом", async () => {
    await addAnswers({ platform: "chatgpt", daysAgo: 40, total: 30, named: 10 });
    await addAnswers({ platform: "chatgpt", daysAgo: 5, total: 30, named: 10 });
    await addAnswers({ platform: "claude", daysAgo: 5, total: 30, named: 30 });

    const result = await visibility();

    expect(result.assistantBasis.verdict).toBe("widened");
    expect(result.assistantBasis.added).toEqual(["claude"]);
    expect(result.totalsDeltaPp).toBe(0);
  });
});
