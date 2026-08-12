# Citeworthy — Implementation Plan

> План имплементации MVP на основе [startup-spec.md](docs/startup-spec.md), [AI Search Delivery OS for Agencies.md](docs/AI%20Search%20Delivery%20OS%20for%20Agencies.md) и [ai-visibility-project.md](docs/ai-visibility-project.md).
>
> Цель MVP: проверить, платят ли агентства за **delivery + proof**, а не только за monitoring. Строим end-to-end skeleton минимальной глубины, а не полированный measurement-слой.

---

## 0. Скоуп-рамка (из спеков)

**Строим сейчас (MVP):**
1. Agency / Client structure (multi-tenant, роли, разделение клиентов)
2. Measurement: prompt sets, scheduled runs, 3 платформы, mentions, citations, история
3. Diagnosis: классификация источников, source gaps, competitor coverage, базовые рекомендации
4. Actions: ручное создание действий (action log) — **не skippable, это вход в proprietary dataset**
5. Experiment timeline: baseline, action date, treatment/control prompts, before/after
6. Reporting: white-label web report + PDF, activity log, next sprint

**Откладываем:** content generation, continuous refresh, GitHub PR-генерация, outreach queue, CMS-интеграции, платформы сверх трёх.

**Не строим никогда (по спеку):** llms.txt tooling, proprietary GEO score, generic AI writer, keyword/backlink база, enterprise SSO, автопубликация без approval.

**Платформы на запуск (решено в ai-visibility-project.md §14):** ChatGPT (OpenAI API), Perplexity (API), Gemini (API). Далее — Google AI Overviews (через SERP-провайдера), затем Claude.

---

## 1. Архитектура (high-level)

```text
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js App Router)                              │
│  Agency App  │  Public Report (share-link)  │  PDF render   │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS / tRPC or REST (JSON)
┌──────────────▼──────────────────────────────────────────────┐
│  API layer (Next.js API routes / отдельный Fastify-сервис)  │
│  Auth · RBAC · Tenancy guard · Rate limiting                │
└──────┬───────────────────────────────┬──────────────────────┘
       │                               │ enqueue
┌──────▼──────────┐          ┌─────────▼──────────────────────┐
│  PostgreSQL     │          │  Worker (BullMQ + Redis)       │
│  (Supabase /    │◄─────────┤  • prompt run executor         │
│   Neon / RDS)   │  write   │  • response parser (mentions)  │
│                 │          │  • citation extractor          │
│  + S3-совмест.  │          │  • source classifier           │
│  storage (PDF,  │          │  • metrics aggregator          │
│  raw responses) │          │  • report/PDF generator        │
└─────────────────┘          └─────────┬──────────────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │  LLM Platform Adapters       │
                        │  OpenAI · Perplexity · Gemini│
                        │  (+ LLM-классификатор для    │
                        │   parsing/diagnosis)         │
                        └──────────────────────────────┘
```

### 1.1 Технологический стек (рекомендация)

| Слой | Выбор | Почему |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui** | быстрая разработка, SSR для публичных отчётов, один язык на весь стек |
| API | **tRPC** внутри Next.js (или Fastify отдельно, если воркер тянет за собой сервис) | end-to-end типизация, минимум boilerplate для соло-разработчика |
| БД | **PostgreSQL** (Supabase или Neon) | реляционная модель идеально ложится на agency→client→prompt→run; RLS как страховка tenancy |
| ORM | **Drizzle** (или Prisma) | типизированные миграции |
| Очереди / cron | **BullMQ + Redis** (Upstash) | scheduled runs, retries, rate-limit к LLM API |
| Хранилище | S3-совместимое (Supabase Storage / R2) | raw responses, PDF |
| Auth | **Better Auth / Auth.js** (email+password, magic link) | без SSO по спеку |
| PDF | **Playwright print-to-PDF** из web-версии отчёта | один шаблон для web и PDF |
| Хостинг | Vercel (frontend/API) + Railway/Fly (worker+Redis) | минимум DevOps |
| Наблюдаемость | Sentry + структурные логи | стоимость запусков и ошибки адаптеров критичны |

Принцип: **монорепо** (`apps/web`, `apps/worker`, `packages/db`, `packages/core`) через pnpm workspaces + Turborepo.

---

## 2. Модель данных (PostgreSQL)

Ядро схемы. Все таблицы (кроме публичных share-ссылок) несут `agency_id` — tenancy enforced на уровне запросов + RLS.

### 2.1 Tenancy и пользователи

```sql
agencies        (id, name, logo_url, brand_color, plan, client_limit,
                 created_at)
users           (id, agency_id, email, name, role, created_at)
                 -- role: owner | admin | member
clients         (id, agency_id, name, domain, industry, brand_names[],
                 competitor_names[], status, created_at)
                 -- brand_names: варианты написания бренда для matching
```

### 2.2 Measurement

```sql
prompt_clusters (id, client_id, name, intent, created_at)
                 -- intent: learning | comparison | purchase | other
prompts         (id, cluster_id, text, is_control, language, geo,
                 active, created_at)
                 -- is_control: контрольные промпты для экспериментов
run_schedules   (id, client_id, cadence, platforms[], samples_per_prompt,
                 next_run_at, active)
                 -- cadence: daily | weekly; samples_per_prompt: повторные
                 -- прогоны (стохастичность LLM — по спеку §27)
runs            (id, schedule_id | null, client_id, started_at,
                 finished_at, status, trigger)  -- scheduled | manual
responses       (id, run_id, prompt_id, platform, model_version,
                 sample_index, raw_text, raw_storage_key,
                 latency_ms, cost_usd, created_at)
mentions        (id, response_id, entity_type, entity_name, position,
                 sentiment, is_client, is_competitor)
citations       (id, response_id, url, domain, title, position)
sources         (id, domain, url_pattern, source_type, first_seen_at)
                 -- source_type: owned | editorial | review | directory |
                 --   ugc | social | product_feed | documentation |
                 --   inaccessible | other
citation_sources(citation_id, source_id)
source_presence (id, client_id, source_id, client_present bool,
                 competitors_present text[], checked_at)
```

### 2.3 Метрики (агрегаты, считает воркер)

```sql
visibility_snapshots (id, client_id, cluster_id | null, platform | null,
                      period_start, period_end,
                      client_visibility_pct, competitor_visibility jsonb,
                      sample_count, created_at)
-- visibility = доля responses в периоде, где клиент упомянут,
-- с повторным сэмплированием и time-window по спеку
```

### 2.4 Actions + Experiments (ключевой слой — Action → Outcome)

```sql
actions      (id, client_id, title, reason, action_type, source_id | null,
              affected_cluster_ids uuid[], estimated_impact, effort,
              owner_user_id, status, created_at, completed_at)
              -- action_type: refresh_page | create_page | technical_fix |
              --   structured_data_fix | crawler_fix | source_outreach |
              --   review_platform | pr_editorial | ugc_community |
              --   product_data_update
              -- status: backlog | in_progress | done | dropped
experiments  (id, action_id, client_id, baseline_start, baseline_end,
              action_date, treatment_cluster_ids uuid[],
              control_prompt_ids uuid[], status, created_at)
experiment_events (id, experiment_id, type, occurred_at, note)
              -- type: action_shipped | indexed | first_new_citation |
              --   visibility_change | note
experiment_results (id, experiment_id, treatment_before, treatment_after,
              control_before, control_after, incremental_pp,
              confidence, evidence jsonb, computed_at)
              -- confidence: low | medium | high — НИКОГДА не "proven"
```

### 2.5 Reporting

```sql
reports       (id, client_id, period_start, period_end, status,
               payload jsonb, pdf_storage_key, created_at)
report_shares (id, report_id, token, expires_at, approved_at,
               approved_by_name)  -- approval by link, без аккаунта клиента
activity_log  (id, agency_id, client_id, actor_user_id | null,
               event_type, payload jsonb, created_at)
```

### 2.6 Billing / usage

```sql
subscriptions (id, agency_id, plan, stripe_customer_id,
               stripe_subscription_id, status, current_period_end)
usage_counters(id, agency_id, period, ai_checks_used, prompts_active,
               clients_active)
```

MVP: Stripe Checkout + customer portal, лимиты (`client_limit`, AI check allowance) проверяются в API. Планы: Starter $499 / Growth $1,299 / Scale $2,499.

---

## 3. Backend: сервисы и пайплайны

### 3.1 Measurement pipeline (worker)

```text
cron tick (BullMQ repeatable)
  → найти run_schedules с next_run_at <= now
  → создать run, поставить job на каждый (prompt × platform × sample)
      → PlatformAdapter.execute(prompt)   [retry ×3, экспон. backoff,
                                           rate-limit на провайдера]
      → сохранить response (raw в S3, метаданные в PG, cost_usd)
  → после завершения всех jobs run'а:
      → ParseJob: извлечь mentions + citations
      → ClassifyJob: классифицировать источники
      → AggregateJob: пересчитать visibility_snapshots
      → обновить experiment timelines (детект first_new_citation)
```

**PlatformAdapter — единый интерфейс:**

```ts
interface PlatformAdapter {
  platform: 'chatgpt' | 'perplexity' | 'gemini';
  execute(prompt: string, opts: {geo?, lang?}): Promise<{
    text: string;
    citations: {url: string; title?: string}[]; // если платформа отдаёт
    modelVersion: string;
    costUsd: number;
  }>;
}
```

- **OpenAI**: Responses API с включённым web search (search-подобный режим — иначе ответы parametric-only и citations пустые).
- **Perplexity**: Sonar API — citations нативно в ответе.
- **Gemini**: API с grounding (Google Search grounding) — grounding metadata как citations.
- Каждый прогон дублируется `samples_per_prompt` раз (default 3) — visibility считается по доле, не по одному ответу.

**Extraction (ParseJob):** дешёвая LLM (gpt-4o-mini / Haiku) со structured output:
вход — raw response + список brand_names/competitor_names клиента; выход — JSON `{mentions: [{name, position, sentiment}], urls: [...]}`. Плюс детерминированный fallback: regex/alias-match по brand_names.

**Source classification (ClassifyJob):** двухступенчато —
1. rule-based по домену (client domain → owned; g2.com/capterra → review; reddit/форумы → ugc; известные каталоги → directory);
2. остальное — LLM-классификатор по домену+title+сниппету. Результат кэшируется в `sources` (домен классифицируется один раз).

### 3.2 Diagnosis service

Считается по запросу (или после каждого run) на данных периода:

- **Source mix per cluster:** распределение citation source_types (как в спеке: 31% editorial / 24% product pages / ...).
- **Influential sources:** топ-N источников по частоте цитирования в кластере; для каждого — client_present / competitors_present (из mentions на этих страницах + LLM-проверка "упомянут ли бренд X на этой странице" по fetched content — MVP: по тексту citation-контекста, полный fetch — v1.1).
- **Gap statement (текстовый вывод):** template + LLM-суммаризация: «Основной gap создаётся third-party sources: competitor присутствует в 16/25 влиятельных источников, клиент — в 4».
- **Basic recommendations:** rule-based генератор кандидатов в actions: owned-источник устарел → refresh_page; influential source без клиента и reachable → source_outreach; кластера без owned-страницы → create_page. Каждая рекомендация обязана содержать `reason` (принцип §22.6: «every recommendation must explain why»). Кнопка «Convert to action».

### 3.3 Experiment engine

- При переводе action в `done` — предложить создать experiment: baseline = visibility за 14–28 дней до action_date; treatment = affected clusters; control = prompts с `is_control` (или незатронутые кластера).
- Воркер после каждого run дописывает точки timeline и детектит события (новый citation с датой > action_date в затронутом кластере → event `first_new_citation`).
- `experiment_results` считается формулой из спека: `incremental_pp = Δtreatment − Δcontrol`; confidence — эвристика (объём сэмплов, концентрация lift в affected cluster, наличие new citation, стабильность control). **В UI и отчётах всегда «estimated», никогда «proven»** (принцип «never fake causality»).

### 3.4 Reporting service

- Генерация `reports.payload` (jsonb) по шаблону из спека §10: visibility before/after, competitor gap, completed work (из actions), results (new citations, mentions, Δvisibility), highest-impact action (из experiments), next sprint (открытые actions).
- Web-версия — публичная страница по `report_shares.token` (без логина клиента), полностью white-label: логотип агентства, brand_color, **ноль вендорского брендинга**.
- PDF: Playwright рендерит ту же страницу с print-CSS → S3.
- Approval by link: кнопка «Approve» на share-странице пишет `approved_at`.

### 3.5 API surface (основные роуты/процедуры)

```text
auth.*                signup / login / invite member
agency.get/update     (branding: logo, color)
clients.crud
prompts.clusters.crud, prompts.crud, prompts.importCsv
schedules.crud, runs.triggerManual, runs.get, runs.list
measurement.visibility(clientId, {clusterId?, platform?, period})
measurement.responses.list / .get (drill-down до raw answer)
diagnosis.sourceGraph(clientId, clusterId)
diagnosis.recommendations(clientId)
actions.crud, actions.convertFromRecommendation
experiments.crud, experiments.timeline(id)
reports.generate, reports.get, reports.share, reports.exportPdf
billing.checkout, billing.portal, billing.usage
publicReport.get(token), publicReport.approve(token)
```

Каждый вызов проходит tenancy guard: `resource.agency_id === session.agency_id`.

---

## 4. Frontend: структура и дизайн

### 4.1 Карта экранов

```text
/login, /signup, /invite/[token]

/                       → Agency dashboard: список клиентов (карточки:
                          visibility, gap, open actions, last report)
/settings               → agency profile, branding (logo, color), team,
                          billing (Stripe portal), usage

/clients/[id]           → Client overview (главный рабочий экран)
  ├─ /measure           → visibility charts, платформы, кластера,
  │                       drill-down в responses/answers
  ├─ /diagnose          → Source Influence Graph + gaps + recommendations
  ├─ /actions           → action queue (kanban/таблица)
  ├─ /experiments       → список + timeline детально
  └─ /reports           → история отчётов, генерация, share, PDF

/r/[token]              → Публичный white-label отчёт (без auth)
```

### 4.2 Ключевые экраны — дизайн-описание

**Client Overview.** Вверху — 4 stat-карточки: AI Visibility (крупная цифра + спарклайн + Δ за период), Competitor Gap (−14 pp → −6 pp), Open Actions, Last Report. Ниже — visibility line chart (клиент vs топ-3 конкурента, переключатель платформ), справа — recent activity feed. Внизу — «Recommended next actions» (топ-3 рекомендации с reason и кнопкой Convert to action).

**Measure.** Таблица кластеров: name, intent, prompts count, visibility %, Δ, competitor best. Клик по кластеру → prompts со своими visibility → клик по prompt → история ответов по платформам: сам текст ответа, подсвеченные mentions (клиент — зелёным, конкуренты — оранжевым), citations списком. Это создаёт доверие к измерению — агентство должно видеть сырой ответ.

**Diagnose.** Центральный экран ценности. Для выбранного кластера:
- Донат/бар source mix (editorial / product / review / UGC / other);
- Таблица influential sources: домен, тип, частота цитирования, client ✓/✗, competitors (аватарки/чипы), кнопка «Create action»;
- Текстовый diagnosis-блок («Основной gap — third-party sources…»);
- Упрощённый Source Influence Graph как Sankey/столбчатая визуализация Prompt cluster → Source types → Top sources → Присутствие брендов. (Полноценный граф — post-MVP; в MVP таблица + sankey достаточны.)

**Actions.** Kanban (Backlog / In progress / Done) + табличный вид. Карточка: title, type-badge, impact (High/Med/Low), effort, owner-аватар, affected clusters chips. Drawer при клике: reason, source, даты; при переводе в Done — prompt «Create experiment from this action?».

**Experiment timeline.** Вертикальный timeline событий (page updated → indexed → first new citation → visibility increased) + сдвоенный line chart Treatment vs Control с вертикальной пунктирной линией action date. Result-блок: Treatment +16 pp / Control +2 pp / Estimated incremental +14 pp / Confidence: Medium + список supporting evidence. Формулировки строго «estimated», бейдж confidence.

**Public report (`/r/[token]`).** Одностраничный, печатаемый, только брендинг агентства. Секции по спеку §10: Header (лого агентства, клиент, период) → AI Visibility big numbers → Competitor gap → Work completed → Results → Highest-impact action → Next sprint → кнопка Approve. Print-CSS = PDF-шаблон.

### 4.3 Визуальный стиль

- **Тон:** спокойный B2B-инструмент, «инфраструктура, не игрушка». Плотный layout, данные впереди.
- **Тема:** light по умолчанию; нейтральные серые (slate), один accent (indigo/blue) для интерфейса. В публичных отчётах accent замещается `agency.brand_color`.
- **Типографика:** Inter; цифры метрик — tabular-nums, крупные (visibility % — главный герой экранов).
- **Компоненты:** shadcn/ui (Card, Table, Tabs, Dialog, Drawer, Badge, Chart на Recharts). Семантика: зелёный = клиент/рост, оранжевый = конкурент, красный только для ошибок; confidence — нейтральные бейджи (не светофор, чтобы не изображать fake certainty).
- **Empty states:** обязательны на каждом экране с CTA («Add your first client», «Import prompts», «Run first audit») — они и есть activation funnel (§19 Activation).

---

## 5. План работ по этапам

> **Для исполнения АИ-кодером:** рабочая очередь задач — [TASKS.md](TASKS.md) (атомарные задачи с verify-критериями и контрактами C1–C6), инварианты проекта — [CLAUDE.md](CLAUDE.md). Раздел ниже — обзорная карта этапов; недели ориентировочны и относятся к человеческому таймлайну валидации, а не к порядку исполнения задач.

### Этап 0 — Фундамент (неделя 1)

- [ ] Монорепо: pnpm + Turborepo; `apps/web` (Next.js), `apps/worker`, `packages/db`, `packages/core`
- [ ] PostgreSQL + Drizzle: миграции для tenancy/users/clients
- [ ] Auth (email+password, invite по email), RBAC (owner/admin/member), tenancy guard middleware
- [ ] CI (lint, typecheck, tests), деплой web на Vercel, worker на Railway
- [ ] Каркас UI: layout, навигация, agency settings, clients CRUD

**Definition of done:** агентство регистрируется, приглашает участника, создаёт клиента с brand/competitor names.

### Этап 1 — Measurement (недели 2–3)

- [ ] Схема prompt_clusters/prompts/schedules/runs/responses; CSV-импорт промптов
- [ ] PlatformAdapter'ы: OpenAI (web search), Perplexity Sonar, Gemini (grounding); учёт cost_usd
- [ ] BullMQ: scheduled + manual runs, retries, rate limits, samples_per_prompt=3
- [ ] ParseJob (mentions/citations, LLM structured output + alias fallback) — с юнит-тестами на fixture-ответах
- [ ] AggregateJob → visibility_snapshots
- [ ] UI: Measure-экран (кластера → prompts → ответы с подсветкой), visibility chart, ручной запуск run
- [ ] Usage counters (AI checks)

**DoD:** для реального клиента 20–30 промптов гоняются по 3 платформам по расписанию; visibility и история видны и совпадают с ручной проверкой сырых ответов.

### Этап 2 — Diagnosis (неделя 4)

- [ ] Source classifier (rules + LLM, кэш по домену)
- [ ] Source mix + influential sources + presence matrix per cluster
- [ ] Текстовый diagnosis-блок и rule-based рекомендации (каждая с reason)
- [ ] UI: Diagnose-экран (mix chart, sources table, sankey, recommendations)

**DoD:** по кластеру система отвечает «почему клиент проигрывает» в формате примера из спека §6.2.

### Этап 3 — Actions + Experiments (неделя 5)

- [ ] Actions CRUD, kanban, convert-from-recommendation, activity_log
- [ ] Experiments: создание из action, baseline autofill, timeline events (auto-детект first_new_citation), results-расчёт с confidence-эвристикой
- [ ] UI: Actions board, Experiment timeline с Treatment/Control chart

**DoD:** полный цикл action → done → experiment → авто-обновляемый timeline → estimated incremental effect.

### Этап 4 — Reporting + Billing (неделя 6)

- [ ] Report generator (payload по шаблону §10), web-страница `/r/[token]`, approval by link
- [ ] White-label: logo + brand_color, ноль вендорского брендинга в отчёте
- [ ] PDF через Playwright
- [ ] Stripe: Checkout, portal, планы Starter/Growth/Scale, enforcement client_limit и AI-check allowance
- [ ] Sentry, cost-дашборд по агентству (внутренний)

**DoD:** агентство генерирует отчёт, шлёт клиенту ссылку, клиент открывает без логина и жмёт Approve; PDF идентичен web.

### Этап 5 — GTM-инструмент: Free Opportunity Audit (неделя 7)

Внутренний (founder-facing) режим, не публичный self-serve:

- [ ] «Audit mode»: создать клиента-проспекта → сгенерировать 20–30 buyer prompts (LLM по домену/категории, ручная правка) → one-off run → авто-диагноз → черновик Opportunity Report (visibility, gap, source gaps, ranked actions, 90-day scope, suggested retainer $3.5k, estimated effort, margin)
- [ ] Экспорт как white-label PDF для отправки агентству

**DoD:** один audit производится за <2 часов ручной работы; это выполняет Stage 0 validation plan (5 free audits → 3 willing to pay).

### Post-MVP (по фазам спека §25, только после paying demand)

- Phase 2: GitHub-интеграция, page analysis, PR-генерация (diff + sources + human approval)
- Phase 3: Continuous refresh (source change → claims → pages → prompts → PR draft)
- Phase 4: WordPress (REST + application passwords), затем Webflow/Shopify по спросу
- Phase 5: Off-site Human Task Queue (contact research, outreach drafts, tracking)
- Phase 6: Cross-client intelligence (Action → Result dataset, benchmarks) — данные копятся с Этапа 3

---

## 6. Сквозные инженерные решения

**Measurement fidelity (главный риск-поинт по §11):** повторное сэмплирование (≥3/prompt/platform), недельные окна агрегации, хранение всех raw responses (для аудита и переобработки парсером), version-стемпинг model_version. Cost-контроль: ориентир ~$7–21/клиент/платформа на 1,500 runs — считаем cost_usd на каждый response и показываем себе.

**Tenancy:** `agency_id` в каждом запросе через guard + Postgres RLS вторым слоем. Share-токены — единственный анонимный доступ, только на чтение report payload.

**Честность формулировок (принципы §22):** в коде отчётов/экспериментов нет слов «proof/guaranteed/caused»; только «estimated incremental effect» + confidence + evidence list. Это фиксируем в copy-констансах, не в свободном тексте.

**Тестирование:** юнит-тесты на парсер mentions/citations (fixture-ответы каждой платформы — самый хрупкий код), на visibility-агрегацию и experiment math; e2e (Playwright) на золотой путь: create client → import prompts → run → report share.

**Данные с первого дня:** action log и experiment records — обязательные с Этапа 3, потому что Action → Outcome dataset — единственный накапливаемый moat («every month it is missing is a month of data not collected»).

---

## 7. Таймлайн и критерии остановки

| Недели | Этап |
|---|---|
| 1 | Фундамент |
| 2–3 | Measurement |
| 4 | Diagnosis |
| 5 | Actions + Experiments |
| 6 | Reporting + Billing |
| 7 | Free Audit tool → начало Stage 0 validation |

Параллельно с неделями 2–7 идёт outreach (30 агентств → 10 разговоров → 5 аудитов → 3 willing to pay). **Стоп-условия из §13 ai-visibility-project.md действуют:** если ни одно агентство не соглашается посмотреть бесплатный аудит в течение 2 недель после готовности measurement-слоя — чинить канал, а не писать код дальше.
