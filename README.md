# Citeworthy

Agency-first SaaS for AI search visibility. Agencies measure how ChatGPT, Perplexity and Gemini
answer about their clients, diagnose which sources drive the gap, run actions and experiments, and
hand the client a white-label report.

The product name never appears on anything the agency's own client sees — reports and PDFs carry
the agency's logo and colour only.

## What it does

- **Measure.** Repeated samples per prompt across three platforms, aggregated into weekly windows.
  Visibility is the share of answers mentioning the brand, never a single answer.
- **Diagnose.** Which kinds of sources models cite, where competitors appear and the client does
  not, and reasoned recommendations — each one carries a non-empty reason.
- **Deliver.** Actions board, experiments with a control group, activity log.
- **Report.** A public link the client opens without an account, plus PDF export printed from that
  same page.
- **Audit.** A free-audit mode for prospects: generated buyer prompts, one measurement pass, and an
  opportunity report with the proposed scope.

Estimates are labelled as estimates. Words claiming proven causation are banned from the UI and
reports, and a test enforces it.

## Stack

pnpm workspaces + Turborepo.

| Package | What lives there |
|---|---|
| `apps/web` | Next.js 15 App Router, tRPC, Tailwind |
| `apps/worker` | BullMQ worker: runs, parsing, aggregation |
| `packages/core` | Pure business logic — adapters, parsing, metrics, experiment math, report schema |
| `packages/db` | Drizzle schema and migrations, the only place tables are defined |
| `packages/pipeline` | The measurement pipeline shared by web and worker |

## Getting started

```bash
cp .env.example .env && docker compose up -d && pnpm install && pnpm db:migrate && pnpm dev
```

Platform adapters run in mock mode by default (`ADAPTERS_MODE=mock`) — no network, no API keys, and
tests never call out.

## Commands

```bash
pnpm dev          # web + worker
pnpm test         # unit and integration tests
pnpm e2e          # Playwright, against a production build
pnpm lint && pnpm typecheck
pnpm db:migrate | db:seed | db:studio
```

## Deploying

One machine with Docker is enough for the first dozens of agencies:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Four services: Postgres, Redis, web, worker. Migrations run as a one-shot service before the app
starts — the application never changes the schema itself, or two instances would do it at once.
Web and worker are separate images because a measurement run takes minutes and must not share a
process with request handling.

`/api/health` answers 503 while the database is unreachable, so the platform can hold traffic back
instead of serving empty reports.

`.env.production` needs at minimum `POSTGRES_PASSWORD`, `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`. Everything else is optional and the product states
plainly what it cannot do without it: `ADAPTERS_MODE` stays on fixtures until platform keys are
present, email is written to the log until `RESEND_API_KEY` is set, and payments are simply not
offered until Stripe is configured.

## Public API

Read-only, keyed per agency, created in Settings → API. The key is shown once; only its hash is
stored.

```bash
curl -H "Authorization: Bearer $CITEWORTHY_KEY" https://your-host/api/v1/clients
```

| Endpoint | Returns |
|---|---|
| `GET /api/v1/clients` | Clients of the agency |
| `GET /api/v1/clients/{id}/visibility` | Prompt × assistant matrix, intervals, movement |
| `GET /api/v1/clients/{id}/sources` | Cited sources and presence |
| `GET /api/v1/clients/{id}/actions` | Work queue, each row with its reason |
| `GET /api/v1/reports` | Reports and their status |

Figures come from the same functions that render the screens, and carry the same intervals — a
number without one becomes "we grew three points" in someone else's dashboard, which the sample
never claimed.

## Conventions worth knowing

- Every data query goes through `protectedProcedure` + `assertTenant`. A resource belonging to
  another agency returns NOT_FOUND, never FORBIDDEN — the API must not confirm that it exists.
- Visibility is only ever computed from aggregates: at least three samples per prompt per platform,
  weekly windows. Raw responses are always kept, so a parser change can be replayed.
- Wording that claims proven causation is banned in the UI and in reports; approved phrasings live
  in `packages/core/src/copy.ts` and a test greps for violations.
- Reports and PDFs carry the agency's brand only. A test asserts the product leaves no trace there.
- Nothing is ever published to an external system on the client's behalf.

Planning documents and the product spec are kept outside this repository.
