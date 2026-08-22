import { HttpError } from "core";
import type { Connector, ConnectorKind, ConnectorRegistry } from "connectors-core";

/**
 * Obtiene el connector activo de un `kind` dado (ej. "storage", "market-data").
 * Cada server registra como mucho un connector por kind — es lo que hace el
 * backend "intercambiable": la ruta solo conoce la interfaz del kind, nunca
 * la implementación concreta.
 */
export function requireConnector<T extends Connector>(registry: ConnectorRegistry, kind: ConnectorKind): T {
  const [connector] = registry.listByKind(kind) as T[];
  if (!connector) {
    throw new HttpError(501, `No hay ningún connector de tipo "${kind}" registrado en este server`);
  }
  return connector;
}
