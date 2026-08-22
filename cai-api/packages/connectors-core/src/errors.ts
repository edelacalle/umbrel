/**
 * Errores HTTP genéricos, sin dependencia del framework web: cualquier
 * connector los lanza al fallar contra su fuente externa, y la capa `core`
 * (Hono) los traduce a una respuesta JSON con el status correspondiente.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly detail?: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.detail = detail;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Solicitud inválida", detail?: unknown) {
    super(400, message, detail);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Recurso no encontrado") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflicto con el estado actual del recurso") {
    super(409, message);
    this.name = "ConflictError";
  }
}

/** Fallo de un connector al hablar con su fuente externa (upstream) */
export class UpstreamError extends HttpError {
  constructor(message = "Fallo en un servicio externo", detail?: unknown) {
    super(502, message, detail);
    this.name = "UpstreamError";
  }
}
