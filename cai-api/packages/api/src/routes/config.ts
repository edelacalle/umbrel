import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectorRegistry, StorageConnector } from "connectors-core";
import { requireConnector } from "../helpers";

/**
 * Configuración global de la aplicación (no depende de `?instancia=`): se
 * guarda vía el connector `storage` activo con una instancia fija llamada
 * "config", lo que en connector-json produce siempre el fichero
 * `data/config.json` (independientemente de qué instancia/tenant esté
 * activa en el resto de la app).
 */
const INSTANCIA_CONFIG = "config";
const COLECCION_CONFIG = "config";
const ID_CONFIG = "app";

const ConfigSchema = z
  .object({
    ejercicioContable: z.number().int().openapi({
      example: new Date().getFullYear(),
      description: "Año del ejercicio contable activo. Se envía como parámetro (filter[codejercicio]) en las llamadas al ERP.",
    }),
  })
  .openapi("Config");

const ActualizarConfigSchema = ConfigSchema.partial().openapi("ActualizarConfig");

const DEFECTO: z.infer<typeof ConfigSchema> = { ejercicioContable: new Date().getFullYear() };

function aConfig(doc: Record<string, unknown> | null): z.infer<typeof ConfigSchema> {
  const ejercicioContable = doc?.ejercicioContable;
  return { ejercicioContable: typeof ejercicioContable === "number" ? ejercicioContable : DEFECTO.ejercicioContable };
}

const rutaObtener = createRoute({
  method: "get",
  path: "/config",
  tags: ["config"],
  summary: "Obtiene la configuración de la aplicación (fichero config.json)",
  responses: {
    200: { content: { "application/json": { schema: ConfigSchema } }, description: "Configuración actual" },
  },
});

const rutaActualizar = createRoute({
  method: "put",
  path: "/config",
  tags: ["config"],
  summary: "Actualiza (parcialmente) la configuración de la aplicación",
  request: { body: { content: { "application/json": { schema: ActualizarConfigSchema } } } },
  responses: {
    200: { content: { "application/json": { schema: ConfigSchema } }, description: "Configuración actualizada" },
  },
});

export function registerConfigRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  const storage = () => requireConnector<StorageConnector>(registry, "storage");

  app.openapi(rutaObtener, async (c) => {
    const doc = await storage().obtener(INSTANCIA_CONFIG, COLECCION_CONFIG, ID_CONFIG);
    return c.json(aConfig(doc), 200);
  });

  app.openapi(rutaActualizar, async (c) => {
    const cambios = c.req.valid("json");
    const existente = await storage().obtener(INSTANCIA_CONFIG, COLECCION_CONFIG, ID_CONFIG);
    const doc = existente
      ? await storage().actualizar(INSTANCIA_CONFIG, COLECCION_CONFIG, ID_CONFIG, cambios)
      : await storage().insertar(INSTANCIA_CONFIG, COLECCION_CONFIG, { id: ID_CONFIG, ...DEFECTO, ...cambios });
    return c.json(aConfig(doc), 200);
  });
}
