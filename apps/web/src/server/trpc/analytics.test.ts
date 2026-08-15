import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createAgency, createClient, createDb, deleteAgency } from "@repo/db";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/**
 * Verify T97: импорт идемпотентен, чужие источники не засчитываются, а
 * чужой клиент неотличим от несуществующего.
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

function caller(agencyId: string) {
  const user: SessionUser = {
    id: crypto.randomUUID(),
    email: "owner@test.local",
    name: "Owner",
    agencyId,
    role: "owner",
  };
  return appRouter.createCaller({ db, user } as TrpcContext);
}

function day(offsetDays: number): string {
  const date = new Date(Date.now() - offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

describe("analytics", () => {
  let agencyId = "";
  let clientId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Traffic Agency", clientLimit: 10 });
    agencyId = agency.id;
    clientId = (await createClient(db, { agencyId, name: "Ledgerbrook", domain: "lb.test" })).id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  const csv = (rows: string[]) => ["date,source,sessions", ...rows].join("\n");

  it("импорт складывает сессии по ассистентам", async () => {
    await caller(agencyId).analytics.importTraffic({
      clientId,
      csv: csv([
        `${day(3)},chatgpt.com,20`,
        `${day(3)},perplexity.ai,5`,
        `${day(2)},chatgpt.com,10`,
      ]),
    });

    const summary = await caller(agencyId).analytics.summary({ clientId });

    expect(summary.totalSessions).toBe(35);
    expect(summary.byAssistant[0]).toMatchObject({ assistant: "chatgpt", sessions: 30 });
  });

  it("повторный импорт того же дня не удваивает цифру", async () => {
    const file = csv([`${day(1)},chatgpt.com,12`]);

    await caller(agencyId).analytics.importTraffic({ clientId, csv: file });
    await caller(agencyId).analytics.importTraffic({ clientId, csv: file });

    expect((await caller(agencyId).analytics.summary({ clientId })).totalSessions).toBe(12);
  });

  it("источник не из списка ассистентов не засчитывается и назван поимённо", async () => {
    const result = await caller(agencyId).analytics.importTraffic({
      clientId,
      csv: csv([`${day(1)},google,900`]),
    });

    expect(result.imported).toBe(0);
    expect(result.skippedReferrers).toEqual(["google"]);
    expect((await caller(agencyId).analytics.summary({ clientId })).totalSessions).toBe(0);
  });

  it("кривые строки возвращаются с номерами, а не глотаются", async () => {
    const result = await caller(agencyId).analytics.importTraffic({
      clientId,
      csv: csv([`not-a-date,chatgpt.com,5`]),
    });

    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain("Line 2");
  });

  it("дни вне окна в свёртку не попадают", async () => {
    await caller(agencyId).analytics.importTraffic({
      clientId,
      csv: csv([`${day(200)},chatgpt.com,50`]),
    });

    expect((await caller(agencyId).analytics.summary({ clientId })).totalSessions).toBe(0);
  });

  it("живого подключения нет, и это сказано прямо", async () => {
    expect((await caller(agencyId).analytics.summary({ clientId })).liveConnection).toBe(false);
  });

  it("чужой клиент неотличим от несуществующего", async () => {
    const other = await createAgency(db, { name: "Other", clientLimit: 10 });
    try {
      await expect(
        caller(other.id).analytics.summary({ clientId }),
      ).rejects.toThrow(TRPCError);
    } finally {
      await deleteAgency(db, other.id);
    }
  });
});
