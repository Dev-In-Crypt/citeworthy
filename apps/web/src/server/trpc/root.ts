import { router } from "./trpc";
import { agencyRouter } from "./routers/agency";
import { clientsRouter } from "./routers/clients";
import { billingRouter } from "./routers/billing";
import { promptsRouter } from "./routers/prompts";
import { runsRouter } from "./routers/runs";
import { measurementRouter } from "./routers/measurement";
import { diagnosisRouter } from "./routers/diagnosis";

export const appRouter = router({
  agency: agencyRouter,
  clients: clientsRouter,
  billing: billingRouter,
  prompts: promptsRouter,
  runs: runsRouter,
  measurement: measurementRouter,
  diagnosis: diagnosisRouter,
});

export type AppRouter = typeof appRouter;
