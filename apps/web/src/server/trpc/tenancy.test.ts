import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createAgency, createClient, createDb, deleteAgency } from "@repo/db";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext, UserRole } from "./context";
import type { Database } from "@repo/db";

/**
 * Verify T04. Главное утверждение: чужой ресурс неотличим от несуществующего.
 * Требует поднятой БД (docker compose up -d && pnpm db:migrate).
 */

const { db, close } = createDb();

function contextFor(user: SessionUser | null): TrpcContext {
  return { db: db as Database, user };
}

function userIn(agencyId: string, role: UserRole = "owner"): SessionUser {
  return { id: crypto.randomUUID(), email: `${role}@test.local`, name: "Test", agencyId, role };
}

describe("tenancy guard", () => {
  let agencyA = "";
  let agencyB = "";
  let clientA = "";
  let clientB = "";

  beforeAll(async () => {
    const a = await createAgency(db, { name: "Agency A", clientLimit: 10 });
    const b = await createAgency(db, { name: "Agency B", clientLimit: 10 });
    agencyA = a.id;
    agencyB = b.id;

    clientA = (
      await createClient(db, { agencyId: agencyA, name: "Client A", domain: "a.test" })
    ).id;
    clientB = (
      await createClient(db, { agencyId: agencyB, name: "Client B", domain: "b.test" })
    ).id;
  });

  afterAll(async () => {
    await deleteAgency(db, agencyA);
    await deleteAgency(db, agencyB);
    await close();
  });

  it("отдаёт собственного клиента", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyA)));
    const client = await caller.clients.get({ id: clientA });
    expect(client.name).toBe("Client A");
  });

  it("на чужого клиента отвечает NOT_FOUND, а не FORBIDDEN", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyA)));

    await expect(caller.clients.get({ id: clientB })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
      "ожидался TRPCError с кодом NOT_FOUND",
    );
  });

  it("несуществующий и чужой клиент неразличимы", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyA)));
    const missing = await caller.clients
      .get({ id: crypto.randomUUID() })
      .catch((e: TRPCError) => e.code);
    const foreign = await caller.clients.get({ id: clientB }).catch((e: TRPCError) => e.code);

    expect(missing).toBe(foreign);
  });

  it("в списке нет клиентов чужого агентства", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyA)));
    const list = await caller.clients.list();

    expect(list.map((c) => c.id)).toContain(clientA);
    expect(list.map((c) => c.id)).not.toContain(clientB);
  });

  it("не даёт обновить чужого клиента", async () => {
    const caller = appRouter.createCaller(contextFor(userIn(agencyA)));

    await expect(caller.clients.update({ id: clientB, name: "Hijacked" })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
    );
  });

  it("без сессии — UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(contextFor(null));

    await expect(caller.clients.list()).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "UNAUTHORIZED",
    );
  });

  it("приглашение видно по токену и скрывает чужие агентства за NOT_FOUND", async () => {
    const admin = appRouter.createCaller(contextFor(userIn(agencyA, "admin")));
    const { token } = await admin.agency.invite({ email: "teammate@a.test", role: "member" });

    const info = await admin.agency.inviteInfo({ token });
    expect(info.agencyName).toBe("Agency A");
    expect(info.email).toBe("teammate@a.test");

    await expect(admin.agency.inviteInfo({ token: "nonexistent-token" })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
    );
  });

  it("member не может приглашать", async () => {
    const member = appRouter.createCaller(contextFor(userIn(agencyA, "member")));

    await expect(member.agency.invite({ email: "x@a.test", role: "member" })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
  });

  it("agency.get отдаёт только своё агентство", async () => {
    const callerA = appRouter.createCaller(contextFor(userIn(agencyA)));
    const callerB = appRouter.createCaller(contextFor(userIn(agencyB)));

    expect((await callerA.agency.get()).name).toBe("Agency A");
    expect((await callerB.agency.get()).name).toBe("Agency B");
  });

  it("member не может создавать клиентов, admin может", async () => {
    const member = appRouter.createCaller(contextFor(userIn(agencyA, "member")));
    await expect(
      member.clients.create({ name: "X", domain: "x.test", brandNames: [], competitorNames: [] }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN");

    const admin = appRouter.createCaller(contextFor(userIn(agencyA, "admin")));
    const created = await admin.clients.create({
      name: "Created by admin",
      domain: "ok.test",
      brandNames: [],
      competitorNames: [],
    });
    expect(created.agencyId).toBe(agencyA);
  });
});
