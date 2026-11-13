# ── Build-Stage: Vite-Produktionsbuild ──────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Workspace-Manifeste zuerst (Layer-Cache) — Build-Kontext: Monorepo-Root!
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY apps/web apps/web
COPY packages/shared packages/shared
RUN cd apps/web && npx vite build

# ── Runtime-Stage: nginx statisch + API-Proxy ────────────────
FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1