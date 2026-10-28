# Sprout shield forwarder (zforward): Node orchestrator + zcash-devtool light-wallet CLI.
# Multi-stage. Every external input is pinned: Rust image, zcash-devtool commit (built --locked), Node image.
# Built for linux/amd64 on fly.io. NOT built or run in CI yet — see README "Before going live".

# ---------------------------------------------------------------- 1. zcash-devtool (Rust)
ARG RUST_IMAGE=rust:1.94-bookworm
FROM ${RUST_IMAGE} AS zcash
# zcash/zcash-devtool main @ 2026-10-17 ("Merge pull request #258"). NU6.3 / Ironwood-aware.
ARG ZCASH_DEVTOOL_REV=0b3436bb8d235c67cd36b800cb45a7b1b489c415
RUN apt-get update \
 && apt-get install -y --no-install-recommends protobuf-compiler libsqlite3-dev pkg-config clang \
 && rm -rf /var/lib/apt/lists/*
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
RUN git init /src && cd /src \
 && git remote add origin https://github.com/zcash/zcash-devtool \
 && git fetch --depth 1 origin ${ZCASH_DEVTOOL_REV} \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${ZCASH_DEVTOOL_REV}"
WORKDIR /src
# Default features = ["transparent-inputs"] (needed: 1Click pays a t-address). No tui/qr.
# rust-toolchain.toml says channel "stable" (would make rustup fetch whatever is newest): drop it so the pinned
# image toolchain is used.
RUN rm -f rust-toolchain.toml \
 && cargo build --release --locked --bin zcash-devtool \
 && strip target/release/zcash-devtool \
 && ./target/release/zcash-devtool --help >/dev/null

# ---------------------------------------------------------------- 2. Node build
FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------------------------------------------------------------- 3. runtime
FROM node:22.20.0-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libsqlite3-0 tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=zcash /src/target/release/zcash-devtool /usr/local/bin/zcash-devtool
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production PORT=8080 HOST=:: HOME=/home/node \
    WALLET_DIR=/data/wallet STATE_FILE=/data/zforward-state.json ZCASH_DEVTOOL_BIN=/usr/local/bin/zcash-devtool
EXPOSE 8080
# Entry point fixes /data ownership on the fly volume, then drops to the unprivileged "node" user.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
