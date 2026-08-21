# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Distribución BUNDLE del backend Node (servers/node) de caipyme-backend —
# a diferencia de ../container/ y ../container2/ (que instalan el workspace
# con pnpm y ejecutan el código sin compilar vía `tsx`, arrastrando
# node_modules completo a la imagen final), container3/ compila con esbuild
# un ÚNICO fichero JS puro (dist/server.mjs) que inlinea todo el workspace
# (core, connectors-core, connector-json/coingecko/facturascripts/fx/onchain,
# api) y sus dependencias npm. La imagen final NO lleva node_modules, ni
# pnpm, ni package.json — solo node + ese fichero.
#
# Al no llevar binarios nativos (connector-sqlite/better-sqlite3 queda FUERA
# de este mini-workspace a propósito — ver README.md), el resultado no está
# ligado a la arquitectura de CPU de la máquina que hizo el build: se puede
# reconstruir en cualquier host, o publicarse multi-arch con
# `docker buildx build --platform linux/amd64,linux/arm64`.
#
# STORAGE_BACKEND soportado: solo "json" (fijado en buildApp.ts de este
# mini-workspace, no configurable por variable de entorno en esta imagen).
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.0

########################################
# Stage 1: build — instala el mini-workspace y genera el bundle único
########################################
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Manifests primero, para cachear la capa de `pnpm install` mientras no
# cambien las dependencias.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/connectors-core/package.json packages/connectors-core/package.json
COPY packages/connector-json/package.json packages/connector-json/package.json
COPY packages/connector-coingecko/package.json packages/connector-coingecko/package.json
COPY packages/connector-facturascripts/package.json packages/connector-facturascripts/package.json
COPY packages/connector-fx/package.json packages/connector-fx/package.json
COPY packages/connector-onchain/package.json packages/connector-onchain/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/server-node/package.json packages/server-node/package.json

# Requiere pnpm-lock.yaml propio de container3/ ya generado (ver README.md,
# paso "Generar el lockfile") — build reproducible, sin depender de la
# resolución de rangos semver contra el registro en cada build.
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY esbuild.config.mjs ./

RUN pnpm run build

########################################
# Stage 2: runtime — SOLO node + el bundle. Sin node_modules, sin pnpm.
########################################
FROM node:${NODE_VERSION}-slim AS runtime

# ca-certificates: llamadas HTTPS salientes de los connectors (CoinGecko,
# Blockstream, RPCs Ethereum/TON/Solana, FacturaScripts).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/dist/server.mjs ./server.mjs

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8787) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
