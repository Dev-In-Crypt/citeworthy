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
import { publicReportRouter } from "./routers/public-report";
import { apiKeysRouter } from "./routers/api-keys";
import { analyticsRouter } from "./routers/analytics";

export const appRouter = router({
  agency: agencyRouter,
  apiKeys: apiKeysRouter,
  analytics: analyticsRouter,
  clients: clientsRouter,
  billing: billingRouter,
  prompts: promptsRouter,
  runs: runsRouter,
  measurement: measurementRouter,
  diagnosis: diagnosisRouter,
  actions: actionsRouter,
  experiments: experimentsRouter,
  reports: reportsRouter,
  publicReport: publicReportRouter,
});

export type AppRouter = typeof appRouter;
