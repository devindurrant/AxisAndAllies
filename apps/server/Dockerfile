# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Prisma's schema engine requires OpenSSL on Alpine
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

# Copy full source
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY tsconfig.base.json ./

# Build shared package then server
# prisma generate must run before tsc so Prisma client types exist during compilation
RUN pnpm --filter @aa/shared build
RUN pnpm --filter @aa/server exec prisma generate
RUN pnpm --filter @aa/server build

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Prisma's schema engine and query engine require OpenSSL on Alpine
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/server/package.json ./apps/server/

# Install production dependencies only (prisma is a dependency so it's included)
RUN pnpm install --frozen-lockfile --prod

# Copy built output and prisma schema
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

# Generate Prisma client against the production node_modules
RUN pnpm --filter @aa/server exec prisma generate

EXPOSE 3001

# Run migrations then start server
CMD ["sh", "-c", "pnpm --filter @aa/server exec prisma migrate deploy && node apps/server/dist/index.js"]
