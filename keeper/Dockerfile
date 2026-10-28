# Sprout keeper — fly.io image (node:20-alpine, multi-stage)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    STATE_DIR=/data
WORKDIR /app
# su-exec: the fly volume is mounted over /data at runtime as root:root, so ownership set at build time is
# hidden. The entrypoint fixes /data ownership as root, then drops to the unprivileged `keeper` user.
RUN apk add --no-cache su-exec \
 && addgroup -S keeper && adduser -S keeper -G keeper \
 && mkdir -p /data && chown keeper:keeper /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
ENTRYPOINT ["/bin/sh", "-c", "mkdir -p \"$STATE_DIR\" && chown -R keeper:keeper \"$STATE_DIR\" 2>/dev/null; exec su-exec keeper node dist/index.js"]
