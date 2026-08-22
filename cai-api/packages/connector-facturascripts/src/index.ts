import { HttpError } from "connectors-core";
import type { ConnectorHealth, ConnectorInfo, ErpConnector } from "connectors-core";

export interface FacturaScriptsOptions {
  /** URL base de la instancia, sin `/api/3` al final (ej. `http://localhost/facturas`) */
  baseUrl: string;
  /** Token de la API (Admin > Claves API en FacturaScripts) */
  apiKey?: string;
}

type Metodo = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Ante un 500 no controlado, FacturaScripts devuelve una página HTML de error (con estilos, QR, formulario
 * de informe...) en vez de JSON. Sin esto, esa página entera acababa propagándose como "mensaje de error"
 * hasta la UI. Se extrae el texto del primer `<p>` (donde va el mensaje de la excepción PHP) en vez del HTML.
 */
function extraerMensajeDeHtml(html: string): string | null {
  if (!/<html/i.test(html)) return null;
  const match = html.match(/<p>([\s\S]*?)<\/p>/i);
  const grupo = match?.[1];
  if (!grupo) return null;
  const texto = grupo
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
  return texto || null;
}

async function extraerMensaje(res: Response): Promise<string> {
  const texto = await res.text();
  try {
    const cuerpo = JSON.parse(texto) as { message?: string; error?: string };
    return cuerpo.message ?? cuerpo.error ?? texto;
  } catch {
    return extraerMensajeDeHtml(texto) ?? (texto || `FacturaScripts respondió HTTP ${res.status}`);
  }
}

/**
 * connector-facturascripts — kind: "erp".
 *
 * Proxy genérico hacia el API REST de una instancia de FacturaScripts
 * (`/api/3/{modelo}[/{id}]`). No es específico de una entidad: `modelo` es
 * cualquiera que exponga esa instalación (`Cliente`, `FacturaCliente`,
 * `Producto`...). Los errores de FacturaScripts (404, 400, token
 * inválido...) se propagan como `HttpError` con su status HTTP original.
 * Ejemplo de referencia de "erp": para otro ERP con modelos/recursos por
 * nombre, implementa `ErpConnector` igual que este.
 */
export class FacturaScriptsConnector implements ErpConnector {
  readonly info: ConnectorInfo = {
    id: "facturascripts",
    kind: "erp",
    label: "FacturaScripts",
    description: "Proxy genérico hacia el API REST de una instancia de FacturaScripts",
  };

  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(opts: FacturaScriptsOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    try {
      await this.listarModelos();
      return { ok: true, checkedAt: new Date().toISOString() };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e), checkedAt: new Date().toISOString() };
    }
  }

  listarModelos(): Promise<unknown> {
    return this.peticion("GET", "");
  }

  listar(modelo: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
    return this.peticion("GET", modelo, { query });
  }

  obtener(modelo: string, id: string): Promise<unknown> {
    return this.peticion("GET", modelo, { id });
  }

  crear(modelo: string, datos: unknown): Promise<unknown> {
    return this.peticion("POST", modelo, { body: datos });
  }

  actualizar(modelo: string, id: string, datos: unknown): Promise<unknown> {
    return this.peticion("PUT", modelo, { id, body: datos });
  }

  async eliminar(modelo: string, id: string): Promise<void> {
    await this.peticion("DELETE", modelo, { id });
  }

  private async peticion(
    metodo: Metodo,
    modelo: string,
    opciones: { id?: string; query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<unknown> {
    if (!this.apiKey) {
      // 503, no 500: no es un bug de este código, es una dependencia externa
      // (FacturaScripts) sin configurar en este entorno.
      throw new HttpError(
        503,
        'El connector "facturascripts" no tiene configurada FACTURASCRIPTS_API_KEY — sin ella no puede hablar con el ERP',
      );
    }

    let url = `${this.baseUrl}/api/3/${encodeURIComponent(modelo)}`;
    if (opciones.id !== undefined) url += `/${encodeURIComponent(opciones.id)}`;
    if (opciones.query) {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(opciones.query)) {
        if (valor === undefined) continue;
        params.set(clave, String(valor));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    let cuerpo: string | undefined;
    if (opciones.body !== undefined) {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(opciones.body as Record<string, unknown>)) {
        if (valor === undefined) continue;
        params.set(clave, typeof valor === "string" ? valor : JSON.stringify(valor));
      }
      cuerpo = params.toString();
    }

    const res = await fetch(url, {
      method: metodo,
      headers: {
        Token: this.apiKey,
        Accept: "application/json",
        ...(cuerpo !== undefined ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: cuerpo,
    });

    if (!res.ok) throw new HttpError(res.status, await extraerMensaje(res));
    if (res.status === 204) return undefined;
    const texto = await res.text();
    return texto ? JSON.parse(texto) : undefined;
  }
}
