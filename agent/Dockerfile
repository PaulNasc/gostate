FROM node:20-slim

# System dependencies required by Playwright browsers
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev=false

# Install Playwright browsers — chromium only by default
# To enable all browsers, change the line below to:
#   RUN npx playwright install --with-deps
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
RUN npx playwright install --with-deps chromium

# Copy source and build
COPY . .
RUN npm run build

# Runtime environment defaults (override via docker-compose or -e flags)
ENV NODE_ENV=production
ENV AGENT_MAX_CONCURRENT=3
ENV BACKEND_URL=http://host.docker.internal:4000

# Healthcheck: verify process is alive (agent has no HTTP port by default)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('fs').statSync('/proc/1/status')" || exit 1

CMD ["node", "dist/agent.js"]
