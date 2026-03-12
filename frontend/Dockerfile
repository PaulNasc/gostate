# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

ARG VITE_API_BASE=http://localhost:4000
ENV VITE_API_BASE=$VITE_API_BASE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage (nginx) ─────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: redirect all 404s to index.html
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
