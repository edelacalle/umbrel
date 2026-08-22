import type { Connector } from "../types";

/**
 * kind: "fx" — tipos de cambio entre divisas fiat. Separado de
 * "market-data" porque su semántica es distinta (un par de divisas, no un
 * activo) y porque normalmente se cachea con un TTL propio.
 */
export interface FxConnector extends Connector {
  obtenerTasa(origen: string, destino: string): Promise<number>;
}
