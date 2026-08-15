import { z } from "zod";
import { generateApiKey } from "@repo/core";
import { createApiKey, listApiKeys, revokeApiKey } from "@repo/db";
import { protectedProcedure, roleProcedure, router } from "../trpc";

/**
 * Ключи публичного API.
 *
 * Создание и отзыв — только admin: ключ читает данные всех клиентов
 * агентства, и раздавать такое право рядовому участнику незачем.
 */
export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await listApiKeys(ctx.db, ctx.user.agencyId);

    // Хэша наружу нет даже своему агентству: показывать нечего, а хранить
    // его в ответе значит рано или поздно записать в лог.
    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
    }));
  }),

  create: roleProcedure("admin")
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const generated = await generateApiKey();

      const saved = await createApiKey(ctx.db, {
        agencyId: ctx.user.agencyId,
        name: input.name,
        prefix: generated.prefix,
        hash: generated.hash,
      });

      // Единственный момент, когда ключ существует целиком. Дальше в базе
      // только хэш, и второй раз показать его будет нечем.
      return { id: saved.id, name: saved.name, prefix: saved.prefix, token: generated.token };
    }),

  revoke: roleProcedure("admin")
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await revokeApiKey(ctx.db, input.id, ctx.user.agencyId);
      return { revoked: true };
    }),
});
