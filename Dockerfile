# ExPress: one image, four processes (API, worker, sample store, Portal). Pick the process with the container command.
#   node dist/apps/api/src/index.js
#   node dist/apps/worker/src/index.js
#   node dist/apps/demo-store/src/index.js
#   node node_modules/next/dist/bin/next start apps/portal --hostname 0.0.0.0 --port $PORT
# The Portal embeds API_URL / STORE_URL at build time, so pass them as build args (or let the host expose env vars as build args).
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.server.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
ARG API_URL=http://localhost:4000
ARG PORTAL_URL=http://localhost:3000
ARG STORE_URL=http://localhost:3001
ARG API_INTERNAL_URL=http://127.0.0.1:4000
ENV API_URL=$API_URL PORTAL_URL=$PORTAL_URL STORE_URL=$STORE_URL API_INTERNAL_URL=$API_INTERNAL_URL DEMO_MODE=local NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build && rm -rf .local

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production LISTEN_HOST=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
EXPOSE 3000 3001 4000
CMD ["node","dist/apps/api/src/index.js"]
