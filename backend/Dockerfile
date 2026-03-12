# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Data directory for SQLite and artifacts
RUN mkdir -p /app/data/artifacts

EXPOSE 4000

CMD ["node", "dist/server.js"]
