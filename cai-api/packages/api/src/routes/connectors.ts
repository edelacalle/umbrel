import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectorRegistry } from "connectors-core";

const ConnectorInfoSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    label: z.string(),
    description: z.string(),
  })
  .openapi("ConnectorInfo");

const ConnectorHealthSchema = z
  .object({
    ok: z.boolean(),
    detail: z.string().optional(),
    checkedAt: z.string(),
  })
  .openapi("ConnectorHealth");

const rutaListar = createRoute({
  method: "get",
  path: "/connectors",
  tags: ["connectors"],
  summary: "Lista los connectors activos en esta instancia, con su clasificación (kind)",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ConnectorInfoSchema) } },
      description: "Connectors registrados",
    },
  },
});

const rutaSalud = createRoute({
  method: "get",
  path: "/connectors/health",
  tags: ["connectors"],
  summary: "Comprobación de salud de todos los connectors registrados",
  responses: {
    200: {
      content: { "application/json": { schema: z.record(z.string(), ConnectorHealthSchema) } },
      description: "Salud por connector",
    },
  },
});

/** Endpoints de introspección: qué connectors hay activos y su estado */
export function registerConnectorsRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  app.openapi(rutaListar, (c) => c.json(registry.list().map((conn) => conn.info), 200));
  app.openapi(rutaSalud, async (c) => c.json(await registry.healthCheckAll(), 200));
}
