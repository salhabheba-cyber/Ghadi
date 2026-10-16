# Production image for GHADI (Railway or any container host).
FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Local OCR (no third-party service): Tesseract with English/French/Arabic packs, and poppler for PDFs. French/Arabic packs are untested here.
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra tesseract-ocr-ara poppler-utils && rm -rf /var/lib/apt/lists/*
ENV OCR_PROVIDER=tesseract
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-lock.yaml ./
# devDependencies are kept because the migration/seed scripts run with tsx at start-up.
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm build
EXPOSE 3000
# Applies pending SQL migrations (idempotent), optionally creates the owner admin login from ADMIN_EMAIL/ADMIN_PASSWORD (remove ADMIN_PASSWORD afterwards), then starts the server on $PORT.
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed && { pnpm tsx scripts/bootstrap-admin.ts || true; } && pnpm start -p ${PORT:-3000} -H 0.0.0.0"]
