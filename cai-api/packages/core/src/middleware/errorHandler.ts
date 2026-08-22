import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HttpError } from "connectors-core";

/** Traduce cualquier error lanzado por una ruta o connector a una respuesta JSON consistente */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, detail: err.detail }, err.status as ContentfulStatusCode);
  }
  console.error(err);
  return c.json({ error: "Error interno del servidor" }, 500);
};
