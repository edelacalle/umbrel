import { BadRequestError } from "../errors";
import type { Connector } from "../types";

/** Documento genérico: cualquier objeto con un `id` de tipo string, sin esquema fijo */
export type Documento = { id: string } & Record<string, unknown>;

/** Instancia usada cuando la ruta no especifica ninguna (ver `validarInstancia`) */
export const INSTANCIA_POR_DEFECTO = "default";

const PATRON_INSTANCIA_VALIDA = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Valida que un nombre de instancia sea seguro para usar como nombre de
 * fichero (evita path traversal tipo "../../etc/passwd" u otros caracteres
 * peligrosos). Toda implementación de `StorageConnector` que traduzca
 * `instancia` a una ruta de fichero debe pasar primero por aquí.
 */
export function validarInstancia(instancia: string): string {
  if (!PATRON_INSTANCIA_VALIDA.test(instancia)) {
    throw new BadRequestError(
      `Nombre de instancia inválido: "${instancia}" (solo letras, números, "-" y "_", máximo 64 caracteres)`,
    );
  }
  return instancia;
}

/**
 * kind: "storage" — persistencia de los datos propios de la app (no de una
 * fuente externa). Modelo de colección de documentos, deliberadamente sin
 * esquema: cada API concreta define la forma de sus documentos con Zod en
 * sus propias rutas; el connector solo los guarda y los recupera por id.
 *
 * `instancia` identifica qué base de datos usar dentro del mismo connector
 * (ej. `data/cliente1.json` vs `data/cliente2.json`, o el equivalente en
 * SQLite/KV): es lo que permite servir varios inquilinos/entornos desde el
 * mismo proceso de API sin desplegar nada por separado.
 */
export interface StorageConnector extends Connector {
  listar<T extends Documento = Documento>(instancia: string, coleccion: string): Promise<T[]>;
  obtener<T extends Documento = Documento>(instancia: string, coleccion: string, id: string): Promise<T | null>;
  insertar<T extends Documento = Documento>(instancia: string, coleccion: string, doc: T): Promise<T>;
  actualizar<T extends Documento = Documento>(
    instancia: string,
    coleccion: string,
    id: string,
    cambios: Partial<T>,
  ): Promise<T | null>;
  eliminar(instancia: string, coleccion: string, id: string): Promise<boolean>;
  /** Ejecuta `fn` de forma atómica frente a esa instancia de la fuente de almacenamiento */
  transaccion<R>(instancia: string, fn: () => Promise<R> | R): Promise<R>;
}
