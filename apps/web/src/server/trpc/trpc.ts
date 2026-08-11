import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext, UserRole } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Инвариант 1 (CLAUDE.md): каждый запрос к данным проходит через protectedProcedure.
 * Пользователь без агентства не может читать ничего.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.user.agencyId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: { ...ctx, user: { ...ctx.user, agencyId: ctx.user.agencyId } },
  });
});

const ROLE_RANK: Record<UserRole, number> = { member: 0, admin: 1, owner: 2 };

/** Процедура, доступная только с ролью не ниже указанной. */
export function roleProcedure(minimum: UserRole) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ROLE_RANK[ctx.user.role] < ROLE_RANK[minimum]) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next();
  });
}

/**
 * Проверка принадлежности ресурса тенанту.
 *
 * Чужой ресурс отдаёт NOT_FOUND, а не FORBIDDEN: FORBIDDEN подтвердил бы,
 * что ресурс с таким id существует. Отсутствующий и чужой должны быть неразличимы.
 */
export function assertTenant(
  resource: { agencyId: string } | null | undefined,
  agencyId: string,
): asserts resource is { agencyId: string } {
  if (!resource || resource.agencyId !== agencyId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}
