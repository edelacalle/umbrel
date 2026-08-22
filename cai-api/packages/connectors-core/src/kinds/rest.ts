import type { Connector } from "../types";

/**
 * kind: "rest" — comodín para una API REST externa que no encaja en
 * ninguna categoría más específica (market-data, fx, erp, blockchain).
 * Antes de usar este kind, comprueba si lo que necesitas es en realidad una
 * variante de uno de los otros (ej. "otro proveedor de cotizaciones" es
 * "market-data", no "rest").
 */
/** Subconjunto de `RequestInit` sin depender de los tipos DOM/Node del consumidor */
export interface RestRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RestConnector extends Connector {
  request<T = unknown>(path: string, init?: RestRequestInit): Promise<T>;
}
