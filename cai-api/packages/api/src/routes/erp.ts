import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectorRegistry, ErpConnector } from "connectors-core";
import { requireConnector } from "../helpers";

const ParamsModelo = z.object({
  modelo: z.string().openapi({ param: { name: "modelo", in: "path" }, example: "Cliente" }),
});
const ParamsModeloId = ParamsModelo.extend({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "1" }),
});

const rutaListarModelos = createRoute({
  method: "get",
  path: "/erp",
  tags: ["erp"],
  summary: "Catálogo de modelos disponibles en el ERP conectado (kind: erp)",
  responses: { 200: { content: { "application/json": { schema: z.unknown() } }, description: "Catálogo de modelos" } },
});

const rutaListar = createRoute({
  method: "get",
  path: "/erp/{modelo}",
  tags: ["erp"],
  summary: "Lista registros de un modelo (reenvía query string: limit/offset/sort/filter...)",
  request: { params: ParamsModelo },
  responses: { 200: { content: { "application/json": { schema: z.unknown() } }, description: "Listado" } },
});

const rutaObtener = createRoute({
  method: "get",
  path: "/erp/{modelo}/{id}",
  tags: ["erp"],
  summary: "Obtiene un registro por id",
  request: { params: ParamsModeloId },
  responses: { 200: { content: { "application/json": { schema: z.unknown() } }, description: "Registro" } },
});

const rutaCrear = createRoute({
  method: "post",
  path: "/erp/{modelo}",
  tags: ["erp"],
  summary: "Crea un registro (body reenviado tal cual al ERP)",
  request: { params: ParamsModelo, body: { content: { "application/json": { schema: z.record(z.string(), z.unknown()) } } } },
  responses: { 201: { content: { "application/json": { schema: z.unknown() } }, description: "Registro creado" } },
});

const rutaActualizar = createRoute({
  method: "put",
  path: "/erp/{modelo}/{id}",
  tags: ["erp"],
  summary: "Actualiza un registro",
  request: {
    params: ParamsModeloId,
    body: { content: { "application/json": { schema: z.record(z.string(), z.unknown()) } } },
  },
  responses: { 200: { content: { "application/json": { schema: z.unknown() } }, description: "Registro actualizado" } },
});

const rutaEliminar = createRoute({
  method: "delete",
  path: "/erp/{modelo}/{id}",
  tags: ["erp"],
  summary: "Elimina un registro",
  request: { params: ParamsModeloId },
  responses: { 204: { description: "Eliminado" } },
});

/**
 * Proxy genérico hacia un ERP externo (kind: "erp"): `modelo` es cualquier
 * recurso que exponga el ERP conectado, no algo fijado por esta API. No
 * valida el body por entidad (los campos dependen de la instalación
 * externa, no de este proyecto).
 */
export function registerErpRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  const erp = () => requireConnector<ErpConnector>(registry, "erp");

  app.openapi(rutaListarModelos, async (c) => c.json(await erp().listarModelos(), 200));

  app.openapi(rutaListar, async (c) => {
    const { modelo } = c.req.valid("param");
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    return c.json(await erp().listar(modelo, query), 200);
  });

  app.openapi(rutaObtener, async (c) => {
    const { modelo, id } = c.req.valid("param");
    return c.json(await erp().obtener(modelo, id), 200);
  });

  app.openapi(rutaCrear, async (c) => {
    const { modelo } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await erp().crear(modelo, body), 201);
  });

  app.openapi(rutaActualizar, async (c) => {
    const { modelo, id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await erp().actualizar(modelo, id, body), 200);
  });

  app.openapi(rutaEliminar, async (c) => {
    const { modelo, id } = c.req.valid("param");
    await erp().eliminar(modelo, id);
    return c.body(null, 204);
  });
}
