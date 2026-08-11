# CLAUDE.md — AI Search Delivery OS

Agency-first SaaS: агентства измеряют AI-visibility своих клиентов (ChatGPT/Perplexity/Gemini), диагностируют source gaps, ведут actions/experiments и отдают white-label отчёты.

## Документы

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — архитектура, схема БД, карта экранов, дизайн. Источник истины по структуре.
- [TASKS.md](TASKS.md) — очередь атомарных задач с verify-критериями. Работать строго по ней: одна задача за раз, по порядку, чекбокс + запись в Log после завершения.
- [startup-spec.md](docs/startup-spec.md) — продуктовый спек (зачем и что); читать при сомнениях в продуктовых решениях.

## Структура

pnpm workspaces + Turborepo:
- `apps/web` — Next.js 15 App Router, tRPC, Tailwind + shadcn/ui
- `apps/worker` — BullMQ-воркер (runs, parse, aggregate)
- `packages/db` — Drizzle-схема и миграции (единственное место определения таблиц)
- `packages/core` — чистая бизнес-логика без I/O-фреймворков: адаптеры, парсинг, метрики, experiment math, report schema. Контракты C1–C6 из TASKS.md живут здесь; менять их можно только осознанно, с обновлением TASKS.md.

## Команды

```
docker compose up -d      # Postgres + Redis (+ MinIO)
pnpm db:migrate | db:seed | db:studio
pnpm dev                  # web + worker
pnpm test                 # юнит + интеграционные
pnpm e2e                  # Playwright
pnpm lint && pnpm typecheck
```

Проверка задачи = её verify из TASKS.md, плюс `pnpm test && pnpm typecheck` перед завершением.

## Инварианты (нарушать нельзя)

1. **Tenancy.** Каждый запрос к данным проходит через `protectedProcedure` + `assertTenant`. Чужой ресурс → NOT_FOUND (не FORBIDDEN — не раскрывать существование). Новые таблицы несут `agency_id` или FK на таблицу, которая его несёт. Единственный анонимный доступ — `/r/[token]` (read-only report + approve).
2. **Честность формулировок.** В UI, отчётах и PDF запрещены слова: «proof», «proven», «guaranteed», «caused», «причинно», «гарантируем». Только «estimated», «confidence: low/medium/high», «evidence». Все такие строки — из copy-констант (`packages/core/src/copy.ts`), не inline. Есть grep-тест (T46) — не ломать его.
3. **White-label.** На `/r/[token]` и в PDF — ноль брендинга продукта: логотип и цвет агентства. Grep-тест (T51).
4. **Никакой автопубликации.** Любая будущая интеграция записи (Git/CMS) — только через explicit human approval. В MVP записи во внешние системы нет вообще.
5. **Не строить:** llms.txt tooling, GEO score, generic AI writer, keyword/backlink базы, SSO. Даже если кажется уместным — это осознанно исключено спеком.
6. **Measurement fidelity.** Visibility только по агрегатам (≥3 sample/prompt/platform, недельные окна) — контракт C3. Raw responses всегда сохраняются в storage (нужны для переобработки парсером). `model_version` и `cost_usd` пишутся на каждый response.
7. **Каждая рекомендация имеет непустой `reason`** — enforced типом/zod, не соглашением.

## Соглашения

- TypeScript strict; никаких `any` в `packages/core`.
- Все внешние LLM/API-вызовы — за интерфейсами из `packages/core`, с mock-реализацией; `ADAPTERS_MODE=mock|live`. Тесты никогда не ходят в сеть.
- Даты в БД — timestamptz UTC; деньги — `cost_usd numeric`.
- Парсинг/математика (mentions, visibility, experiment math) — чистые функции с table-driven тестами; это самый защищённый тестами код проекта.
- **Windows/кодировка (важно):** проект на Windows, шелл — Windows PowerShell 5.1. `Get-Content`/`Set-Content` там ломают UTF-8 (кириллицу в доках) — читать/писать файлы с не-ASCII только через `[System.IO.File]::ReadAllText/WriteAllText` с `UTF8Encoding($false)`, либо через Read/Edit/Write-инструменты. Файлы пишем без BOM, LF.
- **Билд герметичен:** никаких сетевых загрузок на этапе сборки (в окружении TLS-перехват с self-signed CA — любой fetch падает с `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Шрифты/ассеты только локальные, `next/font/google` не использовать.
- Секреты только из env; `.env.example` поддерживается актуальным. Отсутствие ключа платформы — понятная ошибка при `ADAPTERS_MODE=live`, а не падение при старте.
- UI-стиль: раздел 4.3 IMPLEMENTATION_PLAN.md (slate + indigo, Inter, tabular-nums; зелёный = клиент, оранжевый = конкуренты; у каждого экрана есть empty state с CTA).
- Язык интерфейса — английский (покупатель — англоязычные агентства).
