import { createApp } from "core";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectorRegistry } from "connectors-core";
import { registerConfigRoutes } from "./routes/config";
import { registerConnectorsRoutes } from "./routes/connectors";
import { registerErpRoutes } from "./routes/erp";
import { registerItemsRoutes } from "./routes/items";
import { registerOnChainRoutes } from "./routes/onchain";
import { registerQuotesRoutes } from "./routes/quotes";
import { registerVerifactuRoutes } from "./routes/verifactu";

export interface CreateApiAppOptions {
  registry: ConnectorRegistry;
}

/**
 * API de ejemplo, extensible: añadir un endpoint nuevo es añadir un
 * `register*Routes` más aquí (o una ruta más dentro de uno existente). Ni
 * este fichero ni `core` necesitan saber qué connectors concretos hay
 * detrás — eso lo decide cada server en `servers/*\/src/index.ts`.
 */
export function createApiApp(opts: CreateApiAppOptions): OpenAPIHono {
  return createApp({
    info: {
      title: "caipyme API",
      version: "0.1.0",
      description:
        "API genérica y extensible sobre Hono + OpenAPI, con connectors intercambiables (ver GET /connectors). Documentación interactiva en /docs.",
    },
    registerRoutes: (app) => {
      registerConnectorsRoutes(app, opts.registry);
      registerConfigRoutes(app, opts.registry);
      registerItemsRoutes(app, opts.registry);
      registerQuotesRoutes(app, opts.registry);
      registerErpRoutes(app, opts.registry);
      registerOnChainRoutes(app, opts.registry);
      registerVerifactuRoutes(app, opts.registry);
    },
  });
}
