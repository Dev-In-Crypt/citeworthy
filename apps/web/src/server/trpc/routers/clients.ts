import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  countClientsByAgency,
  createClient,
  deleteClient,
  getAgencyById,
  getClientById,
  listClientsByAgency,
  updateClient,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";

const clientInput = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(255),
  industry: z.string().max(200).optional(),
  brandNames: z.array(z.string().min(1)).default([]),
  competitorNames: z.array(z.string().min(1)).default([]),
  /**
   * `prospect` — клиент для бесплатного аудита: ещё не платит, но измеряется
   * тем же пайплайном. Отдельного флага нет — статус и так перечисление.
   */
  status: z.enum(["active", "paused", "prospect"]).optional(),
});

export const clientsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listClientsByAgency(ctx.db, ctx.user.agencyId)),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const client = await getClientById(ctx.db, input.id);
    assertTenant(client, ctx.user.agencyId);
    return client;
  }),

  create: roleProcedure("admin")
    .input(clientInput)
    .mutation(async ({ ctx, input }) => {
      const agency = await getAgencyById(ctx.db, ctx.user.agencyId);
      const used = await countClientsByAgency(ctx.db, ctx.user.agencyId);

      // Лимит тарифа — billing unit продукта это активный клиентский аккаунт.
      if (agency && used >= agency.clientLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your plan covers ${agency.clientLimit} active clients. Upgrade to add more.`,
        });
      }

      return createClient(ctx.db, { ...input, agencyId: ctx.user.agencyId });
    }),

  update: roleProcedure("admin")
    .input(clientInput.partial().extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getClientById(ctx.db, input.id);
      assertTenant(existing, ctx.user.agencyId);

      const { id, ...patch } = input;
      return updateClient(ctx.db, id, patch);
    }),

  delete: roleProcedure("admin")
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getClientById(ctx.db, input.id);
      assertTenant(existing, ctx.user.agencyId);

      await deleteClient(ctx.db, input.id);
      return { id: input.id };
    }),
});
