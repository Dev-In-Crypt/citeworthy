# Образ воркера: прогоны по расписанию, разбор ответов, свёртки.
#
# Отдельный образ, а не тот же процесс, что веб: прогон занимает минуты и
# упирается в лимиты платформ, и делить его с обработкой HTTP-запросов
# значит ронять интерфейс из-за чужого таймаута.
#
# Здесь нужен браузер Playwright: печать PDF ходит по настоящей странице.

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/pipeline/package.json packages/pipeline/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

FROM deps AS runner
COPY . .
ENV NODE_ENV=production

# Воркер запускается из исходников через tsx: сборки в JS у него нет, и
# вводить её ради одного процесса — лишний шаг, который разъедется с dev.
CMD ["pnpm", "--filter", "@repo/worker", "run", "start"]
