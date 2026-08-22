import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { NotFoundError } from "core";
import { INSTANCIA_POR_DEFECTO } from "connectors-core";
import type { ConnectorRegistry, StorageConnector } from "connectors-core";
import { requireConnector } from "../helpers";

/**
 * Ejemplo de endpoint totalmente genérico: un CRUD de "items" sin más forma
 * fija que `id` + `nombre`, respaldado por el connector de kind "storage"
 * que esté activo (json, sqlite o kv). Sirve de plantilla para añadir
 * cualquier otro recurso propio de la API: define su schema Zod, sus rutas
 * con `createRoute`, y opera sobre el connector correspondiente.
 *
 * `?instancia=` selecciona qué base de datos usar dentro del mismo
 * connector (ej. `data/cliente1.json` vs `data/cliente2.json` en
 * connector-json) — así el mismo server puede servir varios
 * inquilinos/entornos a la vez. Si se omite, se usa "default".
 */
const COLECCION = "items";

// `crypto.randomUUID()` es global tanto en Node (18+) como en Cloudflare
// Workers; no depende de qué connector de storage esté activo.
function generarId(): string {
  return crypto.randomUUID();
}

const ItemSchema = z
  .object({
    id: z.string().openapi({ example: "b2f1c9e0-1234-4a5b-8c9d-000000000000" }),
    nombre: z.string().openapi({ example: "Mi item" }),
    datos: z.record(z.string(), z.unknown()).optional().openapi({ description: "Campos libres adicionales" }),
  })
  .openapi("Item");

const CrearItemSchema = ItemSchema.omit({ id: true }).openapi("CrearItem");
const ActualizarItemSchema = CrearItemSchema.partial().openapi("ActualizarItem");

type Item = z.infer<typeof ItemSchema>;

const ParamsId = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "b2f1c9e0-1234-4a5b-8c9d-000000000000" }),
});

const QueryInstancia = z.object({
  instancia: z
    .string()
    .optional()
    .openapi({
      param: { name: "instancia", in: "query" },
      example: "cliente1",
      description: 'Base de datos a usar dentro del connector activo (por defecto "default")',
    }),
});

const rutaListar = createRoute({
  method: "get",
  path: "/items",
  tags: ["items"],
  summary: "Lista todos los items de una instancia",
  request: { query: QueryInstancia },
  responses: {
    200: { content: { "application/json": { schema: z.array(ItemSchema) } }, description: "Listado de items" },
  },
});

const rutaCrear = createRoute({
  method: "post",
  path: "/items",
  tags: ["items"],
  summary: "Crea un item en una instancia",
  request: { query: QueryInstancia, body: { content: { "application/json": { schema: CrearItemSchema } } } },
  responses: {
    201: { content: { "application/json": { schema: ItemSchema } }, description: "Item creado" },
  },
});

const rutaObtener = createRoute({
  method: "get",
  path: "/items/{id}",
  tags: ["items"],
  summary: "Obtiene un item por id de una instancia",
  request: { params: ParamsId, query: QueryInstancia },
  responses: {
    200: { content: { "application/json": { schema: ItemSchema } }, description: "Item encontrado" },
    404: { description: "No existe ese item" },
  },
});

const rutaActualizar = createRoute({
  method: "put",
  path: "/items/{id}",
  tags: ["items"],
  summary: "Actualiza parcialmente un item de una instancia",
  request: {
    params: ParamsId,
    query: QueryInstancia,
    body: { content: { "application/json": { schema: ActualizarItemSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: ItemSchema } }, description: "Item actualizado" },
    404: { description: "No existe ese item" },
  },
});

const rutaEliminar = createRoute({
  method: "delete",
  path: "/items/{id}",
  tags: ["items"],
  summary: "Elimina un item de una instancia",
  request: { params: ParamsId, query: QueryInstancia },
  responses: {
    204: { description: "Eliminado" },
    404: { description: "No existe ese item" },
  },
});

export function registerItemsRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  const storage = () => requireConnector<StorageConnector>(registry, "storage");

  app.openapi(rutaListar, async (c) => {
    const { instancia = INSTANCIA_POR_DEFECTO } = c.req.valid("query");
    const items = await storage().listar<Item>(instancia, COLECCION);
    return c.json(items, 200);
  });

  app.openapi(rutaCrear, async (c) => {
    const { instancia = INSTANCIA_POR_DEFECTO } = c.req.valid("query");
    const body = c.req.valid("json");
    const item = await storage().insertar<Item>(instancia, COLECCION, { id: generarId(), ...body });
    return c.json(item, 201);
  });

  app.openapi(rutaObtener, async (c) => {
    const { id } = c.req.valid("param");
    const { instancia = INSTANCIA_POR_DEFECTO } = c.req.valid("query");
    const item = await storage().obtener<Item>(instancia, COLECCION, id);
    if (!item) throw new NotFoundError(`No existe el item "${id}" en la instancia "${instancia}"`);
    return c.json(item, 200);
  });

  app.openapi(rutaActualizar, async (c) => {
    const { id } = c.req.valid("param");
    const { instancia = INSTANCIA_POR_DEFECTO } = c.req.valid("query");
    const cambios = c.req.valid("json");
    const item = await storage().actualizar<Item>(instancia, COLECCION, id, cambios);
    if (!item) throw new NotFoundError(`No existe el item "${id}" en la instancia "${instancia}"`);
    return c.json(item, 200);
  });

  app.openapi(rutaEliminar, async (c) => {
    const { id } = c.req.valid("param");
    const { instancia = INSTANCIA_POR_DEFECTO } = c.req.valid("query");
    const borrado = await storage().eliminar(instancia, COLECCION, id);
    if (!borrado) throw new NotFoundError(`No existe el item "${id}" en la instancia "${instancia}"`);
    return c.body(null, 204);
  });
}
