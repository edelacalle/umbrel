import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/errorHandler";

export interface OpenApiDocInfo {
  title: string;
  version: string;
  description?: string;
  // Permite anotar el doc con extensiones OpenAPI (x-...) sin más ceremonia
  [key: `x-${string}`]: unknown;
}

export interface CreateAppOptions {
  info: OpenApiDocInfo;
  /**
   * Punto de extensión: aquí es donde una API concreta registra sus rutas
   * (`app.openapi(route, handler)`). Añadir un endpoint nuevo a la API nunca
   * toca `core`, solo esta función — es lo que hace el sistema "extensible".
   */
  registerRoutes: (app: OpenAPIHono) => void;
  /** Ruta donde se sirve el JSON de OpenAPI (por defecto `/openapi.json`) */
  openApiPath?: string;
  /** Ruta donde se sirve Swagger UI (por defecto `/docs`) */
  docsPath?: string;
  /** Orígenes permitidos por CORS (por defecto: todos, `*`) */
  corsOrigin?: string | string[];
}

/**
 * Construye la app Hono compartida por ambos servers (Node y Cloudflare
 * Worker): mismas rutas, mismo contrato OpenAPI, mismo manejo de errores.
 * Cada server solo aporta el "adaptador" de runtime (ver servers/node y
 * servers/worker).
 */
export function createApp(opts: CreateAppOptions): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: "Solicitud inválida", detail: result.error.issues }, 400);
      }
    },
  });

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: opts.corsOrigin ?? "*",
    }),
  );
  app.onError(errorHandler);

  app.get("/health", (c) => c.json({ ok: true, service: opts.info.title, version: opts.info.version }));

  opts.registerRoutes(app);

  const openApiPath = opts.openApiPath ?? "/openapi.json";
  const docsPath = opts.docsPath ?? "/docs";

  // `servers` se calcula por request a partir del host real (localhost:8787,
  // el dominio del worker en prod...) en vez de dejarlo vacío: sin él,
  // Swagger UI puede intentar resolver la URL base de forma relativa y
  // acabar generando una petición sin esquema http/https válido (visto en
  // Firefox como "URL scheme must be http or https for CORS request").
  app.doc(openApiPath, (c) => ({
    openapi: "3.1.0",
    info: opts.info,
    servers: [{ url: new URL(c.req.url).origin }],
  }));
  app.get(docsPath, swaggerUI({ url: openApiPath }));

  return app;
}
