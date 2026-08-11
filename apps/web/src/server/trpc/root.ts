import { router } from "./trpc";
import { agencyRouter } from "./routers/agency";
import { clientsRouter } from "./routers/clients";

export const appRouter = router({
  agency: agencyRouter,
  clients: clientsRouter,
});

export type AppRouter = typeof appRouter;
