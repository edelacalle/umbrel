import type { Connector, ConnectorHealth, ConnectorKind } from "./types";

/**
 * Registro central de connectors activos en una instancia de la API. Cada
 * server (Node, Worker) construye el suyo en el arranque, según qué
 * connectors haya configurado vía variables de entorno, y se lo pasa a `api`
 * (ver `servers/node/src/index.ts` y `servers/worker/src/index.ts`).
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register<T extends Connector>(connector: T): T {
    if (this.connectors.has(connector.info.id)) {
      throw new Error(`Ya existe un connector registrado con id "${connector.info.id}"`);
    }
    this.connectors.set(connector.info.id, connector);
    return connector;
  }

  get<T extends Connector = Connector>(id: string): T {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`No hay ningún connector registrado con id "${id}"`);
    return connector as T;
  }

  tryGet<T extends Connector = Connector>(id: string): T | undefined {
    return this.connectors.get(id) as T | undefined;
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }

  listByKind(kind: ConnectorKind): Connector[] {
    return this.list().filter((c) => c.info.kind === kind);
  }

  async healthCheckAll(): Promise<Record<string, ConnectorHealth>> {
    const entradas = await Promise.all(
      this.list().map(async (c) => [c.info.id, await c.healthCheck()] as const),
    );
    return Object.fromEntries(entradas);
  }
}
