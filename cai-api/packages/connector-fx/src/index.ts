import { UpstreamError } from "connectors-core";
import type { ConnectorHealth, ConnectorInfo, FxConnector } from "connectors-core";

const BASE_URL = "https://api.frankfurter.app";

export interface FrankfurterOptions {
  /** Antigüedad máxima del valor cacheado antes de refrescarlo, en ms (por defecto 1h) */
  ttlMs?: number;
}

interface RespuestaFrankfurter {
  rates: Record<string, number>;
}

interface EntradaCache {
  tasa: number;
  actualizado: number;
}

/**
 * connector-fx — kind: "fx".
 *
 * Tipos de cambio entre divisas fiat vía Frankfurter (tasas del BCE, sin
 * clave). Cachea en memoria por par de divisas con un TTL; si la fuente
 * falla se sirve el último valor cacheado en vez de romper la petición. A
 * diferencia del conector original de referencia, no aplica ningún valor
 * fijo de emergencia si nunca hubo caché: en ese caso propaga
 * `UpstreamError`, porque un valor inventado para un par de divisas
 * arbitrario sería incorrecto de forma silenciosa.
 */
export class FrankfurterConnector implements FxConnector {
  readonly info: ConnectorInfo = {
    id: "fx",
    kind: "fx",
    label: "Frankfurter",
    description: "Tipos de cambio entre divisas fiat (tasas del BCE) vía Frankfurter",
  };

  private readonly ttlMs: number;
  private readonly cache = new Map<string, EntradaCache>();

  constructor(opts: FrankfurterOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 60 * 60 * 1000;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    try {
      const res = await fetch(`${BASE_URL}/latest?from=USD&to=EUR`);
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e), checkedAt: new Date().toISOString() };
    }
  }

  async obtenerTasa(origen: string, destino: string): Promise<number> {
    const clave = `${origen.toUpperCase()}_${destino.toUpperCase()}`;
    const cacheado = this.cache.get(clave);
    if (cacheado && Date.now() - cacheado.actualizado < this.ttlMs) return cacheado.tasa;

    try {
      const res = await fetch(`${BASE_URL}/latest?from=${origen.toUpperCase()}&to=${destino.toUpperCase()}`);
      if (!res.ok) throw new Error(`Frankfurter respondió HTTP ${res.status}`);
      const datos = (await res.json()) as RespuestaFrankfurter;
      const tasa = datos.rates[destino.toUpperCase()];
      if (!tasa) throw new Error(`Frankfurter no devolvió tasa para ${origen}→${destino}`);

      this.cache.set(clave, { tasa, actualizado: Date.now() });
      return tasa;
    } catch (e) {
      if (cacheado) return cacheado.tasa; // caché caducado como valor defensivo
      throw new UpstreamError(
        `No se pudo obtener la tasa ${origen}→${destino} y no hay caché previo`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
