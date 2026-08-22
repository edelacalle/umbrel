import type { Connector } from "../types";

export interface Cotizacion {
  simbolo: string;
  nombre: string;
  precio: number;
  variacion24h: number;
  moneda: string;
  actualizado: string;
}

/**
 * kind: "market-data" — proveedores de precios/cotizaciones de mercado
 * (cripto, bolsa, materias primas...). Devuelve un mapa clave → cotización
 * para poder pedir varios símbolos en una sola llamada.
 */
export interface MarketDataConnector extends Connector {
  cotizar(simbolos: string[]): Promise<Map<string, Cotizacion>>;
}
