import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { Database } from "./client";
import { agencies, clients, users } from "./schema/tenancy";
import type { Agency, Client, NewClient, User } from "./schema/tenancy";
import { invitations } from "./schema/auth";
import { promptClusters, prompts, responses, runSchedules, runs } from "./schema/measurement";
import type {
  NewResponse,
  NewRun,
  Prompt,
  Response,
  Run,
  RunSchedule,
} from "./schema/measurement";

/**
 * Запросы живут здесь, а не в приложениях: drizzle не должен утекать за границу @repo/db.
 * Эти функции НЕ заменяют tenancy guard — они лишь принимают agencyId, а проверку
 * принадлежности делает assertTenant на стороне API (инвариант 1 в CLAUDE.md).
 */

export async function getAgencyById(db: Database, agencyId: string): Promise<Agency | undefined> {
  const rows = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  return rows[0];
}

export async function createAgency(
  db: Database,
  values: { name: string; clientLimit?: number },
): Promise<Agency> {
  const rows = await db.insert(agencies).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create agency");
  }
  return created;
}

/** Каскадом удаляет пользователей и клиентов агентства. Используется в тестах. */
export async function deleteAgency(db: Database, agencyId: string): Promise<void> {
  await db.delete(agencies).where(eq(agencies.id, agencyId));
}

export async function updateAgency(
  db: Database,
  agencyId: string,
  patch: Partial<Pick<Agency, "name" | "logoUrl" | "brandColor">>,
): Promise<Agency | undefined> {
  const rows = await db.update(agencies).set(patch).where(eq(agencies.id, agencyId)).returning();
  return rows[0];
}

export async function listClientsByAgency(db: Database, agencyId: string): Promise<Client[]> {
  return db.select().from(clients).where(eq(clients.agencyId, agencyId));
}

/**
 * Возвращает клиента по id БЕЗ фильтра по агентству — намеренно.
 * Вызывающий обязан прогнать результат через assertTenant, чтобы чужой ресурс
 * и несуществующий давали одинаковый ответ.
 */
export async function getClientById(db: Database, clientId: string): Promise<Client | undefined> {
  const rows = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return rows[0];
}

export async function countClientsByAgency(db: Database, agencyId: string): Promise<number> {
  const rows = await db.select().from(clients).where(eq(clients.agencyId, agencyId));
  return rows.length;
}

export async function createClient(db: Database, values: NewClient): Promise<Client> {
  const rows = await db.insert(clients).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create client");
  }
  return created;
}

export async function updateClient(
  db: Database,
  clientId: string,
  patch: Partial<Omit<Client, "id" | "agencyId" | "createdAt">>,
): Promise<Client | undefined> {
  const rows = await db.update(clients).set(patch).where(eq(clients.id, clientId)).returning();
  return rows[0];
}

export async function deleteClient(db: Database, clientId: string): Promise<void> {
  await db.delete(clients).where(eq(clients.id, clientId));
}

/**
 * Расписания, которым пора запускаться. Активные, с наступившим next_run_at.
 * Расписание без next_run_at считается ещё не запланированным и не подхватывается —
 * иначе первый же тик запустил бы прогоны по всем клиентам сразу.
 */
export async function listDueSchedules(db: Database, now: Date): Promise<RunSchedule[]> {
  return db
    .select()
    .from(runSchedules)
    .where(
      and(
        eq(runSchedules.active, true),
        isNotNull(runSchedules.nextRunAt),
        lte(runSchedules.nextRunAt, now),
      ),
    );
}

export async function setScheduleNextRun(
  db: Database,
  scheduleId: string,
  nextRunAt: Date,
): Promise<void> {
  await db.update(runSchedules).set({ nextRunAt }).where(eq(runSchedules.id, scheduleId));
}

export async function createRun(db: Database, values: NewRun): Promise<Run> {
  const rows = await db.insert(runs).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create run");
  }
  return created;
}

export async function listRunsByClient(db: Database, clientId: string): Promise<Run[]> {
  return db.select().from(runs).where(eq(runs.clientId, clientId));
}

export async function listActivePromptsForClient(db: Database, clientId: string): Promise<Prompt[]> {
  return db
    .select({
      id: prompts.id,
      clusterId: prompts.clusterId,
      text: prompts.text,
      isControl: prompts.isControl,
      language: prompts.language,
      geo: prompts.geo,
      active: prompts.active,
      createdAt: prompts.createdAt,
    })
    .from(prompts)
    .innerJoin(promptClusters, eq(prompts.clusterId, promptClusters.id))
    .where(and(eq(promptClusters.clientId, clientId), eq(prompts.active, true)));
}

export async function getRunById(db: Database, runId: string): Promise<Run | undefined> {
  const rows = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  return rows[0];
}

export async function getRunSchedule(
  db: Database,
  scheduleId: string,
): Promise<RunSchedule | undefined> {
  const rows = await db.select().from(runSchedules).where(eq(runSchedules.id, scheduleId)).limit(1);
  return rows[0];
}

export async function startRun(db: Database, runId: string): Promise<void> {
  await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));
}

export async function finishRun(
  db: Database,
  runId: string,
  status: "done" | "failed",
): Promise<void> {
  await db.update(runs).set({ status, finishedAt: new Date() }).where(eq(runs.id, runId));
}

export async function createResponse(db: Database, values: NewResponse): Promise<Response> {
  const rows = await db.insert(responses).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create response");
  }
  return created;
}

export async function updateResponseStorageKey(
  db: Database,
  responseId: string,
  key: string,
): Promise<void> {
  await db.update(responses).set({ rawStorageKey: key }).where(eq(responses.id, responseId));
}

export async function countResponsesByRun(db: Database, runId: string): Promise<number> {
  const rows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, runId));
  return rows.length;
}

export async function listResponsesByRun(db: Database, runId: string): Promise<Response[]> {
  return db.select().from(responses).where(eq(responses.runId, runId));
}

export async function listUsersByAgency(db: Database, agencyId: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.agencyId, agencyId));
}

export async function getUserByEmail(db: Database, email: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function createInvitation(
  db: Database,
  values: { agencyId: string; email: string; role: string; token: string; expiresAt: Date },
) {
  const rows = await db.insert(invitations).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create invitation");
  }
  return created;
}

export async function getInvitationByToken(db: Database, token: string) {
  const rows = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  return rows[0];
}

/** Действующее приглашение для адреса: не принято и не истекло. */
export async function getPendingInvitationByEmail(db: Database, email: string) {
  const rows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, email), eq(invitations.accepted, false)))
    .limit(1);

  const invitation = rows[0];
  if (!invitation || invitation.expiresAt.getTime() < Date.now()) {
    return undefined;
  }
  return invitation;
}

export async function listInvitationsByAgency(db: Database, agencyId: string) {
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.agencyId, agencyId), eq(invitations.accepted, false)));
}

export async function markInvitationAccepted(db: Database, token: string): Promise<void> {
  await db.update(invitations).set({ accepted: true }).where(eq(invitations.token, token));
}
