import { router } from "./trpc";
import { agencyRouter } from "./routers/agency";
import { clientsRouter } from "./routers/clients";
import { billingRouter } from "./routers/billing";
import { promptsRouter } from "./routers/prompts";
import { runsRouter } from "./routers/runs";

export const appRouter = router({
  agency: agencyRouter,
  clients: clientsRouter,
  billing: billingRouter,
  prompts: promptsRouter,
  runs: runsRouter,
});

export type AppRouter = typeof appRouter;
