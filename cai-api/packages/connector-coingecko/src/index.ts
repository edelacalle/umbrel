import { UpstreamError } from "connectors-core";
import type { Cotizacion, ConnectorHealth, ConnectorInfo, MarketDataConnector } from "connectors-core";

const BASE_URL = "https://api.coingecko.com/api/v3";

export interface CoinGeckoOptions {
  /** Clave demo opcional; sin ella aplica el rate limit anónimo de CoinGecko */
  apiKey?: string;
  /** Divisa de cotización (por defecto "usd") */
  vsCurrency?: string;
}

interface MonedaMercado {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
  current_price: number | null;
  price_change_percentage_24h: number | null;
}

/**
 * connector-coingecko — kind: "market-data".
 *
 * Cotizaciones de criptoactivos vía la API pública de CoinGecko. Resuelve
 * cada símbolo en dos pasos: primero por ticker (`symbols=`, eligiendo la
 * moneda de mejor puesto por capitalización si el ticker es ambiguo) y,
 * para lo que quede sin resolver, por slug/id exacto de CoinGecko
 * (`ids=`). Ejemplo de implementación de referencia de "market-data": para
 * añadir otro proveedor (ej. bolsa, materias primas), implementa
 * `MarketDataConnector` igual que este.
 */
export class CoinGeckoConnector implements MarketDataConnector {
  readonly info: ConnectorInfo = {
    id: "coingecko",
    kind: "market-data",
    label: "CoinGecko",
    description: "Cotizaciones de criptoactivos vía la API pública de CoinGecko",
  };

  private readonly apiKey: string | undefined;
  private readonly vsCurrency: string;

  constructor(opts: CoinGeckoOptions = {}) {
    this.apiKey = opts.apiKey;
    this.vsCurrency = opts.vsCurrency ?? "usd";
  }

  async healthCheck(): Promise<ConnectorHealth> {
    try {
      const res = await fetch(`${BASE_URL}/ping`);
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e), checkedAt: new Date().toISOString() };
    }
  }

  async cotizar(simbolos: string[]): Promise<Map<string, Cotizacion>> {
    const buscados = [...new Set(simbolos.map((s) => s.trim().toLowerCase()))].filter(Boolean);
    const resultado = new Map<string, Cotizacion>();
    if (buscados.length === 0) return resultado;

    const porSimbolo = await this.pedirMercado(`symbols=${encodeURIComponent(buscados.join(","))}&include_tokens=all`);
    for (const simbolo of buscados) {
      const candidatas = porSimbolo
        .filter((m) => m.symbol.toLowerCase() === simbolo && m.current_price !== null)
        .sort((a, b) => (a.market_cap_rank ?? Number.MAX_VALUE) - (b.market_cap_rank ?? Number.MAX_VALUE));
      const cotizacion = candidatas[0] && this.aCotizacion(candidatas[0]);
      if (cotizacion) resultado.set(simbolo.toUpperCase(), cotizacion);
    }

    const pendientes = buscados.filter((s) => !resultado.has(s.toUpperCase()));
    if (pendientes.length > 0) {
      const porSlug = await this.pedirMercado(`ids=${encodeURIComponent(pendientes.join(","))}`);
      for (const moneda of porSlug) {
        const cotizacion = this.aCotizacion(moneda);
        if (cotizacion) resultado.set(moneda.id.toUpperCase(), cotizacion);
      }
    }

    return resultado;
  }

  private async pedirMercado(params: string): Promise<MonedaMercado[]> {
    // CoinGecko rechaza (403) peticiones sin User-Agent
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "caipyme-backend/0.1 (connector-coingecko)",
    };
    if (this.apiKey) headers["x-cg-demo-api-key"] = this.apiKey;
    const res = await fetch(`${BASE_URL}/coins/markets?vs_currency=${this.vsCurrency}&${params}`, { headers });
    if (!res.ok) throw new UpstreamError(`CoinGecko respondió HTTP ${res.status}`);
    return res.json() as Promise<MonedaMercado[]>;
  }

  private aCotizacion(moneda: MonedaMercado): Cotizacion | null {
    if (moneda.current_price === null) return null;
    return {
      simbolo: moneda.symbol.toUpperCase(),
      nombre: moneda.name,
      precio: moneda.current_price,
      variacion24h: Math.round((moneda.price_change_percentage_24h ?? 0) * 100) / 100,
      moneda: this.vsCurrency.toUpperCase(),
      actualizado: new Date().toISOString(),
    };
  }
}
