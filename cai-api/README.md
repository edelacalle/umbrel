# container3 — bundle autocontenido, sin `node_modules`, portable entre arquitecturas

Tercera variante de imagen Docker para `servers/node`, junto a `../container/` y `../container2/`.

## Por qué existe frente a container/container2

`container/` y `container2/` instalan el workspace pnpm completo y ejecutan el código sin compilar vía `tsx` — la imagen final arrastra un `node_modules` entero (cientos de paquetes) y, si `STORAGE_BACKEND=sqlite`, el binario nativo de `better-sqlite3` compilado para la CPU/arquitectura de la máquina que hizo el build. Llevar esa imagen (o su `node_modules`) a un host con hardware distinto rompe.

`container3/` resuelve esto compilando con `esbuild` un **único fichero JS puro** (`dist/server.mjs`) que inlinea todo el código del workspace y sus dependencias npm. La imagen final (stage `runtime` del `Dockerfile`) solo contiene `node` + ese fichero — sin `node_modules`, sin `pnpm`, sin `package.json`. Al no llevar binarios nativos, no está ligada a la arquitectura de CPU del host de build.

## Limitación: solo `STORAGE_BACKEND=json`

Este mini-workspace **no incluye `connector-sqlite`** (depende de `better-sqlite3`, módulo nativo compilado por arquitectura — justo lo que rompe la portabilidad que busca este contenedor). `packages/server-node/src/buildApp.ts` registra siempre `JsonStorageConnector`; la variable `STORAGE_BACKEND` no existe en `packages/server-node/src/env.ts` de este mini-workspace ni es configurable en esta imagen.

Si se necesita el backend sqlite, usar `../container2/` (que sí instala `better-sqlite3` vía pnpm, con el toolchain nativo de compilación en su stage de build) — o rebuildear `better-sqlite3` para la arquitectura destino.

El resto de connectors (`market-data`/CoinGecko, `fx`/Frankfurter, `erp`/FacturaScripts, `blockchain`/onchain) están presentes igual que en `servers/node/src/buildApp.ts`.

## Estructura

Mini-workspace pnpm propio (`packages/*`), copia aplanada de las fuentes de `core`, `connectors-core`, `connector-json`, `connector-coingecko`, `connector-facturascripts`, `connector-fx`, `connector-onchain`, `api`, `server-node` — no depende del resto de `backend/` como build context (a diferencia de `../container/`).

`esbuild.config.mjs` compila `packages/server-node/src/index.ts` a `dist/server.mjs` (bundle, `platform: node`, `format: esm`, `target: node22`).

## Generar el lockfile

Antes del primer `docker build` (y cada vez que cambien las dependencias de algún `package.json` en `packages/*`), hay que generar `pnpm-lock.yaml` en esta carpeta:

```bash
cd servers/node/container3
pnpm install
```

El `Dockerfile` usa `pnpm install --frozen-lockfile`, así que el lockfile debe estar commiteado y actualizado.

## Uso

```bash
cd servers/node/container3
cp .env.example .env    # opcional, ajustar valores
docker compose up --build
```

O manualmente:

```bash
docker build -t caipyme-backend-server-node-bundle:local .
docker run --rm -p 8787:8787 -v "$(pwd)/data:/app/data" --env-file .env caipyme-backend-server-node-bundle:local
```

`http://localhost:8787/docs` sirve Swagger UI (sus assets se cargan desde CDN en el navegador del cliente, no desde el contenedor — no es una dependencia en tiempo de ejecución del servidor).

## Multi-arquitectura

Al no llevar binarios nativos, la imagen se puede reconstruir en cualquier host, o publicar como imagen multi-arch real:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t caipyme-backend-server-node-bundle:latest --push .
```
