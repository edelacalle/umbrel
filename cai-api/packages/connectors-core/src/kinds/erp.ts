import type { Connector } from "../types";

/**
 * kind: "erp" — proxy genérico hacia un sistema de gestión/ERP externo que
 * expone sus propios "modelos" (clientes, facturas, productos...). El
 * connector no conoce los campos de cada modelo: los reenvía tal cual,
 * igual que hace el ERP real.
 */
export interface ErpConnector extends Connector {
  listarModelos(): Promise<unknown>;
  listar(modelo: string, query?: Record<string, string | number | undefined>): Promise<unknown>;
  obtener(modelo: string, id: string): Promise<unknown>;
  crear(modelo: string, datos: unknown): Promise<unknown>;
  actualizar(modelo: string, id: string, datos: unknown): Promise<unknown>;
  eliminar(modelo: string, id: string): Promise<void>;
}
