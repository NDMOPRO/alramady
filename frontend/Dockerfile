FROM node:22-alpine AS base

# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build the application ──────────────────────────────────────────
FROM base AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN pnpm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy built output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER appuser

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "dist/index.js"]
