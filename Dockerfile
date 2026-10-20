# syntax=docker/dockerfile:1.7
# ── Ghadi · Production Dockerfile ─────────────────────────────────────────────
# Multi-stage build: deps → builder → runner
# The OCR assets (tesseract.js WASM + English data) are copied into
# public/ocr at build time by the prebuild npm hook, so they ship with
# the image and no CDN requests are made at runtime for English OCR.

ARG NODE_VERSION=22-alpine

# ── Stage 1: install deps ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Only copy manifests first for better layer caching.
COPY package.json package-lock.json ./

# ci installs exact locked versions; --ignore-scripts is safe here because
# the one postinstall that matters (OCR asset copy) runs in the builder stage.
RUN npm ci --ignore-scripts

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Copy deps from the previous stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy source.
COPY . .

# The prebuild hook (scripts/copy-ocr-assets.mjs) copies Tesseract WASM +
# English data into public/ocr/.  Running it explicitly here avoids relying
# on the npm lifecycle hook order under --ignore-scripts.
RUN node scripts/copy-ocr-assets.mjs

# Build Next.js.  NEXT_TELEMETRY_DISABLED skips the analytics ping.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: production runner ─────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Don't run as root.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy the standalone Next.js output and the static assets.
# Next.js standalone mode bundles only what's needed to run the server.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

USER nextjs

# Railway injects PORT; Next.js standalone server reads it automatically.
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
