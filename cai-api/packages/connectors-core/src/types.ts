/**
 * Clasificación de las fuentes de datos que puede hablar un connector. Cada
 * subcarpeta de connectors implementa exactamente una de estas categorías
 * (ver CLAUDE.md para el mapeo connector → kind). Añadir una fuente de
 * datos nueva de un tipo ya existente (otro ERP, otro proveedor de
 * cotizaciones...) es implementar la interfaz del kind correspondiente;
 * añadir un tipo de fuente totalmente nuevo es sumar un valor aquí y su
 * interfaz en kinds/.
 */
export type ConnectorKind =
  | "storage" // persistencia propia de la app: fichero, base de datos
  | "market-data" // cotizaciones/precios de mercado externos
  | "fx" // tipos de cambio entre divisas
  | "erp" // proxy genérico hacia un sistema de gestión/ERP externo
  | "blockchain" // lectura on-chain (saldos nativos de una red)
  | "rest"; // conector REST genérico sin categoría más específica

export interface ConnectorInfo {
  /** Identificador único, usado como clave en el registro (ej. "coingecko") */
  id: string;
  kind: ConnectorKind;
  label: string;
  description: string;
}

export interface ConnectorHealth {
  ok: boolean;
  detail?: string;
  checkedAt: string;
}

/** Contrato mínimo que cumple cualquier connector, sea cual sea su kind */
export interface Connector {
  readonly info: ConnectorInfo;
  /** Comprobación ligera de que la fuente subyacente responde (usada por `/health` y por el registro) */
  healthCheck(): Promise<ConnectorHealth>;
}
