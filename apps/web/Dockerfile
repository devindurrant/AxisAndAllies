# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy full source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Build shared package then web app
RUN pnpm --filter @aa/shared build
RUN pnpm --filter @aa/web build

# ── Stage 2: production (nginx) ───────────────────────────────────────────────
FROM nginx:stable-alpine AS production

# Copy Vite build output
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config (SPA routing + API proxy)
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
