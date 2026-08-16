# Образ веб-приложения.
#
# Три стадии: зависимости, сборка, рантайм. Рантайм получает только
# standalone-вывод Next — в нём нет ни Playwright, ни инструментов
# разработки, ни исходников.
#
# Сборка герметична: сеть на этом этапе не используется (в окружении
# перехват TLS, и любой fetch на сборке падает). Шрифты и ассеты локальные.

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /repo

# ---------- Зависимости ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/pipeline/package.json packages/pipeline/
# Браузер Playwright в образ не тянем: он нужен только тестам и печати PDF,
# которая живёт в отдельном воркере.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

# ---------- Сборка ----------
FROM deps AS build
COPY . .
# Сборке Next нужны публичные переменные: они попадают в бандл. Секреты сюда
# не передаются — они читаются в рантайме.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
# Standalone-вывод включается только здесь: на Windows он ломает локальную
# сборку, потому что раскладывается симлинками.
ENV DOCKER_BUILD=1 NEXT_TELEMETRY_DISABLED=1
# Заглушки живут только на время этой команды и не остаются в образе.
# Подключений при сборке не открывается — Next лишь выполняет модули, собирая
# данные страниц, а строки нужны фабрикам. Настоящие значения — в рантайме.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-never-used-at-runtime \
    pnpm --filter @repo/web run build

# ---------- Рантайм ----------
FROM node:22-alpine AS runner
WORKDIR /app
# HOSTNAME задан явно: standalone-сервер Next берёт адрес привязки из этой
# переменной, а Docker подставляет в неё id контейнера. Тогда сервер слушает
# только внешний адрес, снаружи всё работает, а проверка живости изнутри
# ходит на 127.0.0.1 и не достучится — контейнер вечно unhealthy.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

# Непривилегированный пользователь: процессу приложения root не нужен.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Каталога public в проекте нет: шрифты и стили собираются в бандл, а файлы
# агентств живут в хранилище, а не в образе.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

# Каталог хранилища создаётся до монтирования тома и с нужным владельцем:
# свежий именованный том наследует права точки монтирования из образа, иначе
# процесс без root не сможет в него писать.
RUN mkdir -p /data/storage && chown -R nextjs:nodejs /data/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
