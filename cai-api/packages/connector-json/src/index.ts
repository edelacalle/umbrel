import fs from "node:fs";
import path from "node:path";
import { validarInstancia } from "connectors-core";
import type { ConnectorHealth, ConnectorInfo, Documento, StorageConnector } from "connectors-core";

export interface JsonStorageOptions {
  /** Directorio donde vive un fichero `<instancia>.json` por cada instancia usada; se crea si no existe */
  dataDir: string;
}

type Estado = Record<string, Documento[]>;

/**
 * connector-json — kind: "storage".
 *
 * Cada `instancia` es un fichero JSON independiente dentro de `dataDir`
 * (`<dataDir>/<instancia>.json`), cargado en memoria de forma perezosa y
 * volcado a disco tras cada mutación (o una sola vez al final de
 * `transaccion`) — así el mismo server puede servir varias bases de datos
 * (multi-tenant) sin arrancar procesos separados. Sin seguridad
 * multi-proceso: pensado para un único proceso Node (dev, demos, instancias
 * pequeñas). Solo funciona en runtimes con acceso a `fs` (Node), no en
 * Cloudflare Workers — para el worker usa `connector-kv`.
 */
export class JsonStorageConnector implements StorageConnector {
  readonly info: ConnectorInfo = {
    id: "json",
    kind: "storage",
    label: "Almacenamiento en fichero JSON",
    description: "Persistencia local en un fichero JSON por instancia, pensada para desarrollo",
  };

  private readonly dataDir: string;
  private readonly estados = new Map<string, Estado>();
  private readonly profundidadTransaccion = new Map<string, number>();

  constructor(opts: JsonStorageOptions) {
    this.dataDir = opts.dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private rutaFichero(instancia: string): string {
    return path.join(this.dataDir, `${validarInstancia(instancia)}.json`);
  }

  private cargar(instancia: string): Estado {
    const existente = this.estados.get(instancia);
    if (existente) return existente;

    const ruta = this.rutaFichero(instancia);
    const estado: Estado = fs.existsSync(ruta) ? (JSON.parse(fs.readFileSync(ruta, "utf-8")) as Estado) : {};
    this.estados.set(instancia, estado);
    return estado;
  }

  private persistir(instancia: string): void {
    if ((this.profundidadTransaccion.get(instancia) ?? 0) > 0) return;
    fs.writeFileSync(this.rutaFichero(instancia), JSON.stringify(this.cargar(instancia), null, 2));
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return { ok: fs.existsSync(this.dataDir), checkedAt: new Date().toISOString() };
  }

  async listar<T extends Documento = Documento>(instancia: string, coleccion: string): Promise<T[]> {
    return (this.cargar(instancia)[coleccion] as T[] | undefined) ?? [];
  }

  async obtener<T extends Documento = Documento>(instancia: string, coleccion: string, id: string): Promise<T | null> {
    const doc = (this.cargar(instancia)[coleccion] as T[] | undefined)?.find((d) => d.id === id);
    return doc ?? null;
  }

  async insertar<T extends Documento = Documento>(instancia: string, coleccion: string, doc: T): Promise<T> {
    const estado = this.cargar(instancia);
    if (!estado[coleccion]) estado[coleccion] = [];
    estado[coleccion]!.push(doc);
    this.persistir(instancia);
    return doc;
  }

  async actualizar<T extends Documento = Documento>(
    instancia: string,
    coleccion: string,
    id: string,
    cambios: Partial<T>,
  ): Promise<T | null> {
    const lista = this.cargar(instancia)[coleccion] as T[] | undefined;
    const indice = lista?.findIndex((d) => d.id === id) ?? -1;
    if (!lista || indice === -1) return null;
    lista[indice] = { ...lista[indice]!, ...cambios };
    this.persistir(instancia);
    return lista[indice]!;
  }

  async eliminar(instancia: string, coleccion: string, id: string): Promise<boolean> {
    const estado = this.cargar(instancia);
    const lista = estado[coleccion];
    if (!lista) return false;
    const antes = lista.length;
    estado[coleccion] = lista.filter((d) => d.id !== id);
    const borrado = estado[coleccion]!.length < antes;
    if (borrado) this.persistir(instancia);
    return borrado;
  }

  async transaccion<R>(instancia: string, fn: () => Promise<R> | R): Promise<R> {
    this.cargar(instancia); // asegura que el estado está en memoria antes de empezar
    const profundidad = (this.profundidadTransaccion.get(instancia) ?? 0) + 1;
    this.profundidadTransaccion.set(instancia, profundidad);
    try {
      return await fn();
    } finally {
      const restante = profundidad - 1;
      this.profundidadTransaccion.set(instancia, restante);
      if (restante === 0) this.persistir(instancia);
    }
  }
}
