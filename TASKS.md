# TASKS.md — план исполнения для АИ-кодера

> Атомарные задачи в порядке исполнения. Одна задача = одна сессия / один PR.
> Архитектура, схема БД и дизайн экранов — в [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
> Инварианты проекта — в [CLAUDE.md](CLAUDE.md). Читать оба перед любой задачей.
>
> Формат задачи: **цель → затрагиваемые пакеты → verify** (исполняемая проверка; задача не считается сделанной, пока verify не проходит).
> Задачи с пометкой `[H]` требуют действий человека (ключи, аккаунты) — см. раздел «Human checklist» внизу; до их выполнения соответствующие интеграции работают на mock'ах.

---

## Контракты (зафиксированы, не изобретать заново)

### C1. PlatformAdapter (`packages/core/src/adapters/types.ts`)

```ts
export type Platform = 'chatgpt' | 'perplexity' | 'gemini';

export interface AdapterResult {
  text: string;
  citations: { url: string; title?: string }[];
  modelVersion: string;
  costUsd: number;
  latencyMs: number;
}

export interface PlatformAdapter {
  platform: Platform;
  execute(prompt: string, opts?: { geo?: string; lang?: string }): Promise<AdapterResult>;
}
```

### C2. ParsedResponse — выход парсера mentions/citations (`packages/core/src/parsing/types.ts`)

```ts
export interface ParsedResponse {
  mentions: {
    name: string;              // каноническое имя из brand_names/competitor_names
    position: number;          // 1-based порядок появления в ответе
    sentiment: 'positive' | 'neutral' | 'negative';
    isClient: boolean;
    isCompetitor: boolean;
  }[];
  citationUrls: { url: string; title?: string }[];
}
```

### C3. Visibility

`visibility_pct = responses_with_client_mention / total_responses * 100` за период, по всем sample'ам. Агрегируется в разрезах: client × [cluster|null] × [platform|null] × period (неделя). Никогда не считать по одному ответу.

### C4. ReportPayload (`packages/core/src/reports/schema.ts`, zod)

```ts
export const ReportPayload = z.object({
  client: z.object({ name: z.string() }),
  period: z.object({ start: z.string(), end: z.string() }), // ISO dates
  visibility: z.object({ before: z.number(), after: z.number() }),
  competitorGap: z.object({ before: z.number(), after: z.number() }), // pp, знак минус = отставание
  workCompleted: z.array(z.object({ label: z.string(), count: z.number() })),
  results: z.object({
    newCitedUrls: z.number(),
    newBrandMentions: z.number(),
    visibilityDeltaPp: z.number(),
  }),
  highestImpactAction: z.object({
    title: z.string(),
    estimatedContribution: z.string(), // напр. "+4–6 pp", всегда "estimated"
    confidence: z.enum(['low', 'medium', 'high']),
  }).nullable(),
  nextSprint: z.array(z.string()),
});
```

### C5. Experiment math

`incremental_pp = (treatment_after − treatment_before) − (control_after − control_before)`.
Confidence-эвристика (см. задачу T45): начисление баллов за sample size, наличие new citation после action_date, концентрацию lift в affected clusters, стабильность control; маппинг баллов → low/medium/high.

### C6. tRPC-роутеры

Имена и сигнатуры — по разделу 3.5 IMPLEMENTATION_PLAN.md. Все процедуры кроме `publicReport.*` и `auth.*` — protected, с tenancy guard.

---

## Phase 0 — Foundation

- [x] **T00. Монорепо-скелет.** pnpm workspaces + Turborepo: `apps/web` (Next.js 15, TS, Tailwind, shadcn/ui init), `apps/worker` (пустой TS-процесс), `packages/db`, `packages/core`. Общие tsconfig/eslint/prettier.
  Verify: `pnpm install && pnpm build && pnpm lint` зелёные из корня.

- [x] **T01. Локальная инфраструктура.** `docker-compose.yml` с Postgres 16 и Redis 7; `packages/db`: Drizzle настроен, скрипты `db:generate`, `db:migrate`, `db:check`, `db:studio`; `.env.example` со всеми переменными.
  Verify: `docker compose up -d && pnpm db:migrate && pnpm db:check` проходит на чистой БД (`db:check` обязателен — `db:migrate` при пустой схеме не подключается к БД и сам по себе ничего не доказывает).

- [x] **T02. Схема tenancy.** Таблицы `agencies`, `users`, `clients` по разделу 2.1 плана + миграция + seed-скрипт (`pnpm db:seed`: 1 агентство, 1 owner, 2 клиента с brand/competitor names).
  Verify: `pnpm db:seed` идемпотентен; юнит-тест на select seed-данных.

- [ ] **T03. Auth.** Better Auth (email+password) в `apps/web`: signup создаёт agency+owner, login, session; страницы `/login`, `/signup`.
  Verify: Playwright-тест signup→logout→login.

- [ ] **T04. tRPC + tenancy guard + RBAC.** tRPC-каркас, `protectedProcedure` кладёт `agencyId` в контекст; helper `assertTenant(resource.agencyId)`; роли owner/admin/member; invite по email-токену (`/invite/[token]`, отправка писем — mock в dev: лог в консоль).
  Verify: юнит-тест — запрос к чужому clientId возвращает NOT_FOUND (не FORBIDDEN, не утечка существования).

- [ ] **T05. UI shell.** Layout с сайдбаром (Clients, Settings), топбар с agency-именем, тема по разделу 4.3 (slate + indigo, Inter, tabular-nums для метрик).
  Verify: скриншот-прогон Playwright, все роуты рендерятся без ошибок консоли.

- [ ] **T06. Agency settings.** `/settings`: профиль, загрузка логотипа (S3-совместимый storage, в dev — локальный MinIO в docker-compose или файловая заглушка), brand_color picker, список команды + invite.
  Verify: e2e — загрузка png-логотипа и смена цвета сохраняются и переживают reload.

- [ ] **T07. Clients CRUD.** Роутер `clients.*` + страницы: список клиентов (карточки-заглушки метрик), создание/редактирование (name, domain, industry, brand_names[], competitor_names[]).
  Verify: e2e — создать клиента, добавить 2 alias бренда и 3 конкурентов, увидеть в списке.

- [ ] **T08. CI.** GitHub Actions: lint, typecheck, unit-тесты, build; Postgres/Redis как services для тестов.
  Verify: pipeline зелёный на PR.

## Phase 1 — Measurement

- [ ] **T10. Схема measurement.** Таблицы раздела 2.2 плана: `prompt_clusters`, `prompts`, `run_schedules`, `runs`, `responses` (+ `mentions`, `citations` — пустые пока) + миграция + расширение seed (2 кластера × 5 промптов, 1 из них `is_control`).
  Verify: миграция + seed проходят; drizzle-типы экспортированы из `packages/db`.

- [ ] **T11. Fixture-ответы платформ.** `packages/core/fixtures/`: по 3 реалистичных ответа на платформу (текст с упоминаниями брендов + citations в родном формате платформы), включая edge-cases: бренд не упомянут; бренд под alias; ответ без citations.
  Verify: fixtures валидируются против типа `AdapterResult`.

- [ ] **T12. MockAdapter + реестр адаптеров.** Контракт C1 в `packages/core`; `MockAdapter` отдаёт fixtures детерминированно (по хэшу промпта); реестр `getAdapter(platform)`; env-флаг `ADAPTERS_MODE=mock|live`.
  Verify: юнит-тесты MockAdapter; весь дальнейший пайплайн до T25 работает в mock-режиме.

- [ ] **T13. `[H]` OpenAI adapter.** Responses API с web search tool; маппинг annotations → citations; подсчёт costUsd из usage; retry ×3 с backoff на 429/5xx.
  Verify: юнит-тест на маппинг из записанного сырого ответа API (fixture); smoke-скрипт `pnpm adapter:smoke chatgpt "best CRM for startups"` (запускается только при наличии ключа).

- [ ] **T14. `[H]` Perplexity adapter.** Sonar API, citations из ответа, cost, retry.
  Verify: аналогично T13.

- [ ] **T15. `[H]` Gemini adapter.** Google Search grounding, groundingMetadata → citations, cost, retry.
  Verify: аналогично T13.

- [ ] **T16. Worker-скелет.** `apps/worker`: BullMQ, подключение к Redis, очереди `runs`, `parse`, `aggregate`; graceful shutdown; repeatable job — cron-тик раз в 5 мин ищет `run_schedules.next_run_at <= now`.
  Verify: интеграционный тест — тик подхватывает due-schedule и создаёт `run`.

- [ ] **T17. Run-оркестрация.** Создание run → fan-out job'ов (prompt × platform × sample, `samples_per_prompt` default 3) → каждый job вызывает адаптер, пишет `responses` (raw в storage, метаданные+cost в PG) → по завершении всех — enqueue parse. Rate-limit per platform (BullMQ limiter). Статусы run: pending/running/done/failed(partial).
  Verify: интеграционный тест в mock-режиме — schedule на 2 промпта × 3 платформы × 3 sample даёт ровно 18 responses и run.status=done.

- [ ] **T18. ParseJob.** Контракт C2: LLM-экстракция (structured output, дешёвая модель, в тестах — mock LLM) + детерминированный alias-fallback (case-insensitive поиск brand_names/competitor_names). Запись в `mentions`/`citations`.
  Verify: юнит-тесты на всех fixtures из T11: клиент найден под alias; не-упоминание не даёт false positive; citations извлечены полностью. Это самый тестируемый код проекта.

- [ ] **T19. AggregateJob.** Контракт C3 → `visibility_snapshots` (client × cluster × platform × неделя + свёртки с null). Пересчёт идемпотентен (upsert по ключу разреза).
  Verify: юнит-тест: подготовленный набор responses → известные вручную посчитанные проценты; повторный прогон не меняет результат.

- [ ] **T20. Usage counters.** `usage_counters`: инкремент ai_checks на каждый response; роутер `billing.usage`.
  Verify: юнит-тест — run из T17 увеличивает счётчик на 18.

- [ ] **T21. UI: кластера и промпты.** Экран `/clients/[id]/measure`: CRUD кластеров (name, intent) и промптов (text, is_control), CSV-импорт (колонки: cluster,intent,prompt,is_control).
  Verify: e2e — импорт CSV на 10 строк создаёт 2 кластера и 10 промптов.

- [ ] **T22. UI: расписание и ручной запуск.** Настройка schedule (cadence, платформы, samples) + кнопка «Run now» → `runs.triggerManual` → живой статус run'а (поллинг).
  Verify: e2e в mock-режиме — Run now доходит до done, responses видны.

- [ ] **T23. UI: drill-down ответов.** Кластер → промпт → история ответов по платформам: полный текст, подсветка mentions (клиент зелёным, конкуренты оранжевым), список citations.
  Verify: e2e — на seed+mock данных подсветка присутствует у известного fixture-ответа.

- [ ] **T24. UI: visibility chart.** Client overview `/clients/[id]`: stat-карточки (visibility, gap, open actions=0 пока, last report=—) + line chart клиент vs конкуренты, фильтр платформы/кластера (Recharts).
  Verify: e2e — график рендерит данные из visibility_snapshots.

- [ ] **T25. E2e золотой путь measurement.** Playwright: create client → import prompts → run (mock) → drill-down → chart. Закрепляет Phase 1.
  Verify: тест зелёный в CI.

## Phase 2 — Diagnosis

- [ ] **T30. Схема sources + rule-классификатор.** Таблицы `sources`, `citation_sources`, `source_presence`; rule-based классификация по домену: client domain→owned, известные review/directory/UGC-домены (стартовый словарь в `packages/core/src/sources/domains.ts`), остальное→null (для LLM).
  Verify: юнит-тесты на словарь и на owned-матчинг по client.domain.

- [ ] **T31. LLM-классификатор источников.** Для доменов с type=null: LLM по domain+title (mock в тестах), результат кэшируется в `sources` (домен классифицируется один раз глобально). Встроить в parse-пайплайн после T18.
  Verify: юнит-тест — повторная встреча домена не вызывает LLM (спай на клиенте).

- [ ] **T32. Diagnosis service.** `diagnosis.sourceGraph(clientId, clusterId)`: source mix (доли типов), influential sources (топ-N по частоте цитирования: домен, тип, freq, client_present, competitors_present), текстовый gap-statement (template + LLM-суммаризация, mock в тестах). Presence в MVP — по mentions в тех же ответах, где источник цитировался.
  Verify: юнит-тест на подготовленном датасете воспроизводит пример из спека (16/25 vs 4/25 → вывод «gap создаётся third-party sources»).

- [ ] **T33. Recommendations.** Rule-based генератор кандидатов (правила из раздела 3.2 плана), каждый обязан иметь непустой `reason`; роутер `diagnosis.recommendations`.
  Verify: юнит-тесты по одному на каждое правило; тест-инвариант: рекомендация без reason невозможна (тип/zod).

- [ ] **T34. UI: Diagnose.** `/clients/[id]/diagnose`: донат source mix, таблица influential sources (чипы конкурентов, ✓/✗ клиента, кнопка «Create action» — пока disabled до T40), diagnosis-блок, sankey (cluster → source types → top sources).
  Verify: e2e на seed-данных — таблица и mix совпадают с ответом API.

## Phase 3 — Actions + Experiments

- [ ] **T40. Actions.** Схема 2.4 (`actions`) + роутер `actions.*` + convert-from-recommendation (заполняет title/reason/type/source/clusters). Включить кнопку из T34.
  Verify: юнит-тест convert; e2e — рекомендация превращается в action одним кликом.

- [ ] **T41. Activity log.** `activity_log` + запись событий: action created/status changed/completed, run finished, report generated. Feed на client overview.
  Verify: юнит-тест — смена статуса action создаёт запись.

- [ ] **T42. UI: Actions board.** `/clients/[id]/actions`: kanban (Backlog/In progress/Done) + таблица; карточка и drawer по разделу 4.2; при переводе в Done — диалог «Create experiment from this action?».
  Verify: e2e — drag в Done открывает диалог.

- [ ] **T43. Experiments: создание.** Схема (`experiments`, `experiment_events`, `experiment_results`) + создание из action: baseline autofill (14–28 дней до action_date из snapshots), treatment = affected_cluster_ids, control = prompts с is_control.
  Verify: юнит-тест — baseline числа совпадают с ручным расчётом по seed-snapshots.

- [ ] **T44. Timeline auto-events.** В AggregateJob: для активных экспериментов детект `first_new_citation` (новый URL в affected clusters с датой > action_date) и `visibility_change` (пересечение порога Δ); запись в `experiment_events`.
  Verify: интеграционный тест — подложенный «новый» citation после action_date порождает ровно одно событие.

- [ ] **T45. Experiment math + confidence.** Контракт C5 в `packages/core/src/experiments/math.ts` (чистые функции): incremental_pp + балльная эвристика confidence + сборка evidence list.
  Verify: table-driven юнит-тесты, включая пример из спека (18→34 vs 21→23 ⇒ +14 pp, medium).

- [ ] **T46. UI: Experiment timeline.** `/clients/[id]/experiments`: список + детальный экран — вертикальный timeline событий, сдвоенный chart Treatment/Control с пунктиром action date, result-блок («Estimated incremental effect», confidence-бейдж, evidence). Формулировки — только из copy-констант (см. CLAUDE.md).
  Verify: e2e на seed-эксперименте; grep-тест: в bundle отчётных/экспериментных экранов нет слов proven/guaranteed/caused.

## Phase 4 — Reporting + Billing

- [ ] **T50. Report generator.** Контракт C4: сборка payload из snapshots/actions/experiments за период + юнит-тесты; `reports.generate/get`; хранение в `reports.payload`.
  Verify: юнит-тест — payload на seed-данных валиден по zod и числа совпадают с ручным расчётом.

- [ ] **T51. Public report.** `/r/[token]` (SSR, без auth): секции по разделу 4.2, полный white-label (лого + brand_color агентства, ноль упоминаний продукта), print-CSS.
  Verify: e2e — страница открывается в чистой (незалогиненной) сессии; grep рендера на название продукта = 0 вхождений.

- [ ] **T52. Approve by link.** Кнопка Approve на `/r/[token]` → `approved_at`, `approved_by_name` (поле ввода имени); статус виден агентству.
  Verify: e2e — approve из анонимной сессии отражается в приложении.

- [ ] **T53. PDF.** Endpoint `reports.exportPdf`: Playwright print-to-PDF той же страницы → storage; кнопка Download.
  Verify: интеграционный тест — PDF генерируется, размер > 20KB, содержит имя клиента (pdf-parse).

- [ ] **T54. `[H]` Stripe.** Checkout (3 плана), customer portal, webhook → `subscriptions`; enforcement: превышение client_limit блокирует создание клиента с понятной ошибкой; AI-check allowance — мягкий лимит (warning) в MVP.
  Verify: интеграционный тест с stripe-mock/test mode — webhook меняет план и лимит применяется.

- [ ] **T55. `[H]` Observability.** Sentry (web+worker), структурные логи воркера, внутренняя страница `/settings/usage`: cost_usd по клиентам/платформам за период.
  Verify: тестовое исключение доезжает до Sentry (в dev — до консольного транспорта); usage-страница показывает суммы, совпадающие с SUM(cost_usd).

## Phase 5 — Free Opportunity Audit (founder tool)

- [ ] **T60. Audit mode: генерация промптов.** Клиент помечается `is_prospect`; действие «Generate buyer prompts»: LLM по domain+industry → 20–30 промптов с intent, редактируемый список до сохранения.
  Verify: e2e с mock-LLM — генерация, правка, сохранение в кластера.

- [ ] **T61. One-off audit run.** Кнопка «Run audit»: один run по всем платформам → авто parse/classify/aggregate → авто-diagnosis. Прогресс-экран.
  Verify: e2e в mock-режиме — от кнопки до готового diagnose-экрана без ручных шагов.

- [ ] **T62. Opportunity Report.** Расширение ReportPayload полями `opportunity` (current visibility, competitor avg, ranked actions top-20, 90-day scope, suggested retainer, estimated effort, margin — значения retainer/effort вводятся вручную с дефолтами $3,500 / 8–12 h) + white-label PDF.
  Verify: юнит-тест payload; e2e — PDF аудита генерируется для prospect-клиента.

---

## Human checklist `[H]` (нужно от фаундера, код на этих задачах не блокируется — работает mock)

| Когда | Что |
|---|---|
| до T13–T15 live-режима | API-ключи: OpenAI, Perplexity, Google AI (env: `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`) |
| до T54 | Stripe-аккаунт, 3 Price ID, webhook secret |
| до T55 | Sentry DSN |
| до деплоя | Vercel-проект, Railway/Fly для worker+Redis, prod Postgres, S3-bucket, домен |
| постоянно | Outreach по Stage 0 (30 агентств) — вне кода |

## Порядок и зависимости

- Фазы строго последовательны; внутри фазы задачи идут по номерам, кроме независимых пар: T13/T14/T15 (параллельны, после T12), T21–T24 (после T19, между собой почти независимы), T51/T53 (после T50).
- Live-адаптеры (T13–T15) можно отложить до конца Phase 1: всё тестируется в `ADAPTERS_MODE=mock`.
- После каждой фазы: прогнать весь тест-сьют + e2e, обновить чекбоксы здесь, короткая запись в конец файла «Log» (дата, что сделано, что отложено).

## Log

- **2026-08-11 · T02 done.** Схема tenancy (agencies/users/clients + enum'ы plan/user_role/client_status, индексы по agency_id, brand_names/competitor_names как text[]), миграция `0000_square_professor_monster.sql`, идемпотентный seed (Demo Agency, owner, AcmeCRM + Northwind Analytics) и 4 интеграционных теста на его содержимое. Verify: `pnpm db:seed` дважды подряд даёт тот же результат; `pnpm --filter @repo/db test` — 4/4 зелёные. Починено по ходу: drizzle-kit собирает конфиг и схему как CJS и не резолвит ESM-расширения `.js` в импортах — в `packages/db` перешли на импорты без расширений (bundler-резолюция TS их не требует).
- **2026-08-11 · T01 done.** docker-compose (Postgres 16 на 5433, Redis 7 на 6380 — нестандартные порты, чтобы не конфликтовать с локальными установками), Drizzle + postgres.js, `.env.example`, программный мигратор (переживает пустую папку миграций). Verify: `docker compose up -d && pnpm db:migrate && pnpm db:check` зелёные, плюс typecheck/lint/test/build. Уточнение плана: verify T01 усилен `db:check`, т.к. `db:migrate` при пустой схеме не открывает соединение. Починено по ходу: `dotenv` не находил корневой `.env` при запуске из папки пакета (теперь поиск вверх по дереву); `next-env.d.ts` ронял eslint (в ignore + gitignore).
- **2026-08-11 · T00 done.** Монорепо: pnpm workspaces + Turborepo 2, apps/web (Next 15 + React 19 + Tailwind v4 + shadcn-совместимые токены), apps/worker (tsx-скелет), packages/core, packages/db. Общие tsconfig.base / eslint flat config / prettier. Verify: `pnpm install && pnpm build && pnpm lint` зелёные (плюс typecheck и test). Отклонение от плана: `next/font/google` убран — в окружении TLS-перехват, шрифт грузился по сети на этапе билда и ронял сборку; вместо него font-stack, self-hosted Inter возможен в T05.
