# syntax=docker/dockerfile:1.7
# Build Next.js ra HTML tĩnh rồi đóng vào image Caddy (cùng Caddyfile). VPS không chạy Node.
# Build context = thư mục gốc repo (docker-compose.yml), để lấy được deploy/Caddyfile.
# Cache mount: npm và .next/cache giữ lại giữa các lần deploy → build lại chỉ vài chục giây.

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline
COPY frontend/ .
ARG SITE_URL=http://localhost
ENV SITE_URL=${SITE_URL}
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/out /srv
