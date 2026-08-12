import { router } from "./trpc";
import { agencyRouter } from "./routers/agency";
import { clientsRouter } from "./routers/clients";
import { billingRouter } from "./routers/billing";
import { promptsRouter } from "./routers/prompts";
import { runsRouter } from "./routers/runs";
import { measurementRouter } from "./routers/measurement";
import { diagnosisRouter } from "./routers/diagnosis";
import { actionsRouter } from "./routers/actions";
import { experimentsRouter } from "./routers/experiments";
import { reportsRouter } from "./routers/reports";

export const appRouter = router({
  agency: agencyRouter,
  clients: clientsRouter,
  billing: billingRouter,
  prompts: promptsRouter,
  runs: runsRouter,
  measurement: measurementRouter,
  diagnosis: diagnosisRouter,
  actions: actionsRouter,
  experiments: experimentsRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
