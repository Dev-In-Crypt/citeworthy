import { router } from "./trpc";
import { agencyRouter } from "./routers/agency";
import { clientsRouter } from "./routers/clients";
import { billingRouter } from "./routers/billing";

export const appRouter = router({
  agency: agencyRouter,
  clients: clientsRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
