import { and, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "./client";
import { agencies, clients, users } from "./schema/tenancy";
import type { Agency, Client, NewClient, User } from "./schema/tenancy";
import { invitations } from "./schema/auth";
import { usageCounters } from "./schema/billing";
import type { UsageCounter } from "./schema/billing";
import {
  citations,
  mentions,
  promptClusters,
  prompts,
  responses,
  runSchedules,
  runs,
  visibilitySnapshots,
} from "./schema/measurement";
import type {
  Citation,
  Mention,
  NewCitation,
  NewMention,
  NewResponse,
  NewRun,
  Prompt,
  Response,
  NewPrompt,
  NewPromptCluster,
  PromptCluster,
  Run,
  RunSchedule,
  NewVisibilitySnapshotRow,
  VisibilitySnapshotRow,
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

export async function getResponseById(
  db: Database,
  responseId: string,
): Promise<Response | undefined> {
  const rows = await db.select().from(responses).where(eq(responses.id, responseId)).limit(1);
  return rows[0];
}

/** Клиент, которому принадлежит ответ — нужен парсеру для словаря брендов. */
export async function getClientForResponse(
  db: Database,
  responseId: string,
): Promise<Client | undefined> {
  const rows = await db
    .select({ client: clients })
    .from(responses)
    .innerJoin(runs, eq(responses.runId, runs.id))
    .innerJoin(clients, eq(runs.clientId, clients.id))
    .where(eq(responses.id, responseId))
    .limit(1);
  return rows[0]?.client;
}

export async function replaceMentions(
  db: Database,
  responseId: string,
  values: NewMention[],
): Promise<void> {
  // Переразбор должен быть идемпотентным: старые упоминания удаляются целиком,
  // иначе улучшение парсера удваивало бы данные (инвариант 6 — переобработка).
  await db.delete(mentions).where(eq(mentions.responseId, responseId));
  if (values.length > 0) {
    await db.insert(mentions).values(values);
  }
}

export async function replaceCitations(
  db: Database,
  responseId: string,
  values: NewCitation[],
): Promise<void> {
  await db.delete(citations).where(eq(citations.responseId, responseId));
  if (values.length > 0) {
    await db.insert(citations).values(values);
  }
}

export async function listMentionsByResponse(
  db: Database,
  responseId: string,
): Promise<Mention[]> {
  return db.select().from(mentions).where(eq(mentions.responseId, responseId));
}

export async function listCitationsByResponse(
  db: Database,
  responseId: string,
): Promise<Citation[]> {
  return db.select().from(citations).where(eq(citations.responseId, responseId));
}

/** Ответы клиента с признаками упоминаний — вход агрегации (контракт C3). */
export async function listResponseFactsForClient(db: Database, clientId: string) {
  const rows = await db
    .select({
      responseId: responses.id,
      clusterId: prompts.clusterId,
      platform: responses.platform,
      createdAt: responses.createdAt,
      entityName: mentions.entityName,
      isClient: mentions.isClient,
      isCompetitor: mentions.isCompetitor,
    })
    .from(responses)
    .innerJoin(runs, eq(responses.runId, runs.id))
    .innerJoin(prompts, eq(responses.promptId, prompts.id))
    .leftJoin(mentions, eq(mentions.responseId, responses.id))
    .where(eq(runs.clientId, clientId));

  return rows;
}

/**
 * Идемпотентная запись среза. Уникального ограничения в БД нет (см. комментарий
 * к индексу в схеме), поэтому существующая строка ищется явно.
 */
export async function upsertVisibilitySnapshot(
  db: Database,
  values: NewVisibilitySnapshotRow,
): Promise<void> {
  const existing = await db
    .select({ id: visibilitySnapshots.id })
    .from(visibilitySnapshots)
    .where(
      and(
        eq(visibilitySnapshots.clientId, values.clientId),
        values.clusterId == null
          ? isNull(visibilitySnapshots.clusterId)
          : eq(visibilitySnapshots.clusterId, values.clusterId),
        values.platform == null
          ? isNull(visibilitySnapshots.platform)
          : eq(visibilitySnapshots.platform, values.platform),
        eq(visibilitySnapshots.periodStart, values.periodStart),
      ),
    )
    .limit(1);

  const row = existing[0];
  if (row) {
    await db
      .update(visibilitySnapshots)
      .set({
        clientVisibilityPct: values.clientVisibilityPct,
        competitorVisibility: values.competitorVisibility,
        sampleCount: values.sampleCount,
        sufficient: values.sufficient,
      })
      .where(eq(visibilitySnapshots.id, row.id));
    return;
  }

  await db.insert(visibilitySnapshots).values(values);
}

export async function listVisibilitySnapshots(
  db: Database,
  clientId: string,
): Promise<VisibilitySnapshotRow[]> {
  return db
    .select()
    .from(visibilitySnapshots)
    .where(eq(visibilitySnapshots.clientId, clientId));
}

/** Инкремент расхода. Атомарен: несколько job'ов пишут в одну строку параллельно. */
export async function incrementAiChecks(
  db: Database,
  agencyId: string,
  period: string,
  delta = 1,
): Promise<void> {
  await db
    .insert(usageCounters)
    .values({ agencyId, period, aiChecksUsed: delta })
    .onConflictDoUpdate({
      target: [usageCounters.agencyId, usageCounters.period],
      set: {
        aiChecksUsed: sql`${usageCounters.aiChecksUsed} + ${delta}`,
        updatedAt: new Date(),
      },
    });
}

export async function getUsageCounter(
  db: Database,
  agencyId: string,
  period: string,
): Promise<UsageCounter | undefined> {
  const rows = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.agencyId, agencyId), eq(usageCounters.period, period)))
    .limit(1);
  return rows[0];
}

/** Агентство, которому принадлежит прогон — нужно для учёта расхода. */
export async function getAgencyIdForRun(db: Database, runId: string): Promise<string | undefined> {
  const rows = await db
    .select({ agencyId: clients.agencyId })
    .from(runs)
    .innerJoin(clients, eq(runs.clientId, clients.id))
    .where(eq(runs.id, runId))
    .limit(1);
  return rows[0]?.agencyId;
}

export async function getScheduleForClient(
  db: Database,
  clientId: string,
): Promise<RunSchedule | undefined> {
  const rows = await db
    .select()
    .from(runSchedules)
    .where(eq(runSchedules.clientId, clientId))
    .limit(1);
  return rows[0];
}

/** У клиента одно расписание: повторный вызов обновляет существующее. */
export async function upsertRunSchedule(
  db: Database,
  clientId: string,
  values: Pick<RunSchedule, "cadence" | "platforms" | "samplesPerPrompt" | "active">,
): Promise<RunSchedule> {
  const existing = await getScheduleForClient(db, clientId);

  if (existing) {
    const rows = await db
      .update(runSchedules)
      .set(values)
      .where(eq(runSchedules.id, existing.id))
      .returning();
    return rows[0]!;
  }

  const rows = await db
    .insert(runSchedules)
    .values({
      clientId,
      ...values,
      // Первый прогон по расписанию — сразу: иначе агентство создаёт расписание
      // и неделю не понимает, почему данных нет.
      nextRunAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function listRecentRuns(
  db: Database,
  clientId: string,
  limit = 10,
): Promise<Run[]> {
  return db
    .select()
    .from(runs)
    .where(eq(runs.clientId, clientId))
    .orderBy(desc(runs.startedAt))
    .limit(limit);
}

export async function listPromptClusters(
  db: Database,
  clientId: string,
): Promise<PromptCluster[]> {
  return db.select().from(promptClusters).where(eq(promptClusters.clientId, clientId));
}

export async function getPromptClusterById(
  db: Database,
  clusterId: string,
): Promise<PromptCluster | undefined> {
  const rows = await db
    .select()
    .from(promptClusters)
    .where(eq(promptClusters.id, clusterId))
    .limit(1);
  return rows[0];
}

export async function createPromptCluster(
  db: Database,
  values: NewPromptCluster,
): Promise<PromptCluster> {
  const rows = await db.insert(promptClusters).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create prompt cluster");
  }
  return created;
}

export async function updatePromptCluster(
  db: Database,
  clusterId: string,
  patch: Partial<Pick<PromptCluster, "name" | "intent">>,
): Promise<PromptCluster | undefined> {
  const rows = await db
    .update(promptClusters)
    .set(patch)
    .where(eq(promptClusters.id, clusterId))
    .returning();
  return rows[0];
}

export async function deletePromptCluster(db: Database, clusterId: string): Promise<void> {
  await db.delete(promptClusters).where(eq(promptClusters.id, clusterId));
}

export async function listPromptsByClient(db: Database, clientId: string): Promise<Prompt[]> {
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
    .where(eq(promptClusters.clientId, clientId));
}

export async function getPromptById(db: Database, promptId: string): Promise<Prompt | undefined> {
  const rows = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
  return rows[0];
}

export async function createPrompt(db: Database, values: NewPrompt): Promise<Prompt> {
  const rows = await db.insert(prompts).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create prompt");
  }
  return created;
}

export async function updatePrompt(
  db: Database,
  promptId: string,
  patch: Partial<Pick<Prompt, "text" | "isControl" | "active">>,
): Promise<Prompt | undefined> {
  const rows = await db.update(prompts).set(patch).where(eq(prompts.id, promptId)).returning();
  return rows[0];
}

export async function deletePrompt(db: Database, promptId: string): Promise<void> {
  await db.delete(prompts).where(eq(prompts.id, promptId));
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
