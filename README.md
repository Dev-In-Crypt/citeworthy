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

## Documentation

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — architecture, schema, screens, design system
- [TASKS.md](TASKS.md) — the task queue with verify criteria and a log of what was decided and why
- [CLAUDE.md](CLAUDE.md) — invariants that must not be broken
- [docs/startup-spec.md](docs/startup-spec.md) — the product spec
