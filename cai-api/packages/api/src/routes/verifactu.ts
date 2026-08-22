import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectorRegistry, ErpConnector, StorageConnector } from "connectors-core";
import { HttpError, NotFoundError } from "core";
import { createVerifactuInvoice } from "verifactu-node-lib";
import type { Invoice, PreviousInvoiceId, VatLine } from "verifactu-node-lib";
import { requireConnector } from "../helpers";

/**
 * Genera el registro VeriFactu (XML + QR, formato AEAT) de una factura de venta ya emitida en el ERP
 * conectado — asume que es FacturaScripts (modelos `facturaclientes`/`lineafacturaclientes`/`empresas`).
 * Solo aplica a facturas de venta: VeriFactu es una obligación sobre lo que la PYME emite, no sobre lo
 * que compra. La librería `verifactu-node-lib` no firma digitalmente ni envía nada a la AEAT — solo
 * genera el XML/QR (ver README de la librería).
 */

// Configuración del "sistema informático" (software) y el estado de encadenamiento: ambos son globales
// (una única empresa/emisor por instancia de caipyme), guardados vía el connector `storage` activo bajo
// la misma instancia fija "config" que usa `/config` — pero en su propia colección "verifactu".
const INSTANCIA_VERIFACTU = "config";
const COLECCION_VERIFACTU = "verifactu";
const ID_SOFTWARE = "software";
const ID_ENCADENAMIENTO = "encadenamiento";

const ENTORNO_PRUEBAS = true; // sandbox de la AEAT (prewww1/prewww2.aeat.es) — ver pregunta al usuario

const SoftwareSchema = z
  .object({
    developerName: z.string().openapi({ description: "Nombre/razón social del desarrollador del software" }),
    developerIrsId: z.string().openapi({ description: "NIF del desarrollador del software" }),
    name: z.string().openapi({ description: "Nombre del sistema informático" }),
    id: z.string().openapi({ description: "Identificador del sistema informático" }),
    version: z.string(),
    number: z.string().openapi({ description: "Número de instalación" }),
    useOnlyVerifactu: z.boolean(),
    useMulti: z.boolean(),
    useCurrentMulti: z.boolean(),
  })
  .openapi("VerifactuSoftware");

const ActualizarSoftwareSchema = SoftwareSchema.partial().openapi("ActualizarVerifactuSoftware");

type Software = z.infer<typeof SoftwareSchema>;

const DEFECTO_SOFTWARE: Software = {
  developerName: "",
  developerIrsId: "",
  name: "caipyme",
  id: "caipyme",
  version: "0.1.0",
  number: "001",
  useOnlyVerifactu: true,
  useMulti: false,
  useCurrentMulti: false,
};

const VerifactuResultadoSchema = z
  .object({
    qrcode: z.string().nullable().openapi({ description: "Código QR en formato data URL" }),
    xml: z.string().openapi({ description: "XML VeriFactu (envoltorio SOAP) ya decodificado" }),
    hash: z.string(),
    endpoint: z.string().openapi({ description: "Endpoint SOAP de la AEAT correspondiente al entorno usado" }),
    entorno: z.enum(["pruebas", "produccion"]),
  })
  .openapi("VerifactuResultado");

type Registro = Record<string, unknown>;

function normalizarListado(payload: unknown): Registro[] {
  if (Array.isArray(payload)) return payload as Registro[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const posible = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(posible)) return posible as Registro[];
    return [obj];
  }
  return [];
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : Number(v) || fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "DD-MM-YYYY" (formato de FacturaScripts) → Date */
function parseFechaFacturaScripts(fecha: string): Date {
  const [d, m, y] = fecha.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/**
 * Agrupa las líneas de la factura por tipo de IVA (campo `iva` de `lineafacturaclientes`) sumando la base
 * (`pvptotal`, ya sin IVA) de cada grupo. Una línea con `excepcioniva` relleno se trata como exenta.
 */
function agruparLineasPorIva(lineas: Registro[]): { rate: number; base: number; exenta: boolean }[] {
  const grupos = new Map<string, { rate: number; base: number; exenta: boolean }>();
  for (const linea of lineas) {
    const rate = num(linea.iva);
    const exenta = typeof linea.excepcioniva === "string" && linea.excepcioniva.trim() !== "";
    const clave = `${rate}|${exenta}`;
    const grupo = grupos.get(clave) ?? { rate, base: 0, exenta };
    grupo.base += num(linea.pvptotal);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()];
}

/**
 * Simplificación de v1: toda operación sujeta se marca como `S1` (régimen general, no inversión del
 * sujeto pasivo) y toda operación exenta como `E1` — FacturaScripts no tipifica el motivo de exención
 * igual que la AEAT, así que `E1` es un valor de partida a revisar a mano si aplica. No contempla IRPF
 * ni recargo de equivalencia.
 */
function construirLineasIva(lineas: Registro[]): VatLine[] {
  return agruparLineasPorIva(lineas).map((g) => {
    const base = redondear2(g.base);
    if (g.exenta) {
      return { base, rate: 0, vatOperation: "E1", vatKey: "01" };
    }
    return { base, rate: g.rate, amount: redondear2((base * g.rate) / 100), vatOperation: "S1", vatKey: "01" };
  });
}

const ParamsFactura = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "215", description: "idfactura en FacturaScripts" }),
});

const rutaObtenerSoftware = createRoute({
  method: "get",
  path: "/verifactu/config",
  tags: ["verifactu"],
  summary: "Datos del \"sistema informático\" (software) que identifica las facturas VeriFactu",
  responses: {
    200: { content: { "application/json": { schema: SoftwareSchema } }, description: "Configuración actual" },
  },
});

const rutaActualizarSoftware = createRoute({
  method: "put",
  path: "/verifactu/config",
  tags: ["verifactu"],
  summary: "Actualiza (parcialmente) los datos del software VeriFactu",
  request: { body: { content: { "application/json": { schema: ActualizarSoftwareSchema } } } },
  responses: {
    200: { content: { "application/json": { schema: SoftwareSchema } }, description: "Configuración actualizada" },
  },
});

const rutaGenerar = createRoute({
  method: "post",
  path: "/verifactu/facturaclientes/{id}",
  tags: ["verifactu"],
  summary: "Genera el registro VeriFactu (XML + QR) de una factura de venta (kind: erp, modelo facturaclientes)",
  request: { params: ParamsFactura },
  responses: {
    200: { content: { "application/json": { schema: VerifactuResultadoSchema } }, description: "Registro VeriFactu generado" },
  },
});

export function registerVerifactuRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  const erp = () => requireConnector<ErpConnector>(registry, "erp");
  const storage = () => requireConnector<StorageConnector>(registry, "storage");

  // El campo `Software.id` de la librería (identificador del sistema informático para la AEAT) choca de
  // nombre con el `id` que exige `Documento` como clave primaria del storage: se guarda anidado bajo
  // `software` en vez de al mismo nivel, para no confundir ambos "id" distintos.
  async function leerSoftwareGuardado(): Promise<Software | null> {
    const doc = await storage().obtener(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, ID_SOFTWARE);
    const software = doc?.software;
    return software && typeof software === "object" ? (software as Software) : null;
  }

  app.openapi(rutaObtenerSoftware, async (c) => {
    const guardado = await leerSoftwareGuardado();
    if (guardado) return c.json(guardado, 200);

    // primera vez: precarga con los datos fiscales de la empresa configurada en el ERP, para no partir de vacío
    const empresas = normalizarListado(await erp().listar("empresas", { limit: 1 }));
    const empresa = empresas[0];
    return c.json(
      { ...DEFECTO_SOFTWARE, developerName: str(empresa?.nombre), developerIrsId: str(empresa?.cifnif) },
      200,
    );
  });

  app.openapi(rutaActualizarSoftware, async (c) => {
    const cambios = c.req.valid("json");
    const actual = (await leerSoftwareGuardado()) ?? DEFECTO_SOFTWARE;
    const nuevo: Software = { ...actual, ...cambios };
    const existente = await storage().obtener(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, ID_SOFTWARE);
    if (existente) {
      await storage().actualizar(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, ID_SOFTWARE, { software: nuevo });
    } else {
      await storage().insertar(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, { id: ID_SOFTWARE, software: nuevo });
    }
    return c.json(nuevo, 200);
  });

  app.openapi(rutaGenerar, async (c) => {
    const { id } = c.req.valid("param");

    const factura = (await erp().obtener("facturaclientes", id)) as Registro | null;
    if (!factura) throw new NotFoundError(`No existe la factura "${id}" en facturaclientes`);

    const software = (await leerSoftwareGuardado()) ?? DEFECTO_SOFTWARE;
    if (!software.developerIrsId || !software.developerName) {
      throw new HttpError(409, 'Configura antes los datos del software VeriFactu en Configuración ("NIF"/"Nombre" del desarrollador vacíos).');
    }

    const idfactura = factura.idfactura;
    const lineas = normalizarListado(
      await erp().listar("lineafacturaclientes", { "filter[idfactura]": String(idfactura) }),
    );
    if (lineas.length === 0) {
      throw new HttpError(409, `La factura "${id}" no tiene líneas: no se puede calcular el desglose de IVA`);
    }

    const empresa = (await erp().obtener("empresas", String(factura.idempresa ?? "1"))) as Registro | null;
    const issuerIrsId = str(empresa?.cifnif);
    const issuerName = str(empresa?.nombre);
    if (!issuerIrsId || !issuerName) {
      throw new HttpError(502, 'No se pudo obtener el NIF/nombre del emisor desde "/erp/empresas"');
    }

    const codigo = str(factura.codigo);
    const fecha = str(factura.fecha);
    const invoice: Invoice = {
      issuer: { irsId: issuerIrsId, name: issuerName },
      recipient: factura.cifnif ? { irsId: str(factura.cifnif), name: str(factura.nombrecliente), country: "ES" } : undefined,
      id: { number: codigo, issuedTime: parseFechaFacturaScripts(fecha) },
      type: "F1",
      description: {
        text: str(factura.observaciones) || codigo,
        operationDate: parseFechaFacturaScripts(fecha),
      },
      vatLines: construirLineasIva(lineas),
      amount: num(factura.totaliva),
      total: num(factura.total),
    };

    const encadenamientoDoc = await storage().obtener(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, ID_ENCADENAMIENTO);
    const previousId: PreviousInvoiceId | null =
      encadenamientoDoc && encadenamientoDoc.issuerIrsId === issuerIrsId
        ? {
            issuerIrsId: str(encadenamientoDoc.issuerIrsId),
            number: str(encadenamientoDoc.number),
            issuedTime: new Date(str(encadenamientoDoc.issuedTime)),
            hash: str(encadenamientoDoc.hash),
          }
        : null;

    const resultado = await createVerifactuInvoice(invoice, software, previousId, {}, ENTORNO_PRUEBAS);

    const nuevoEncadenamiento = {
      issuerIrsId: resultado.chainInfo.issuerIrsId,
      number: resultado.chainInfo.number,
      issuedTime: resultado.chainInfo.issuedTime.toISOString(),
      hash: resultado.chainInfo.hash,
    };
    if (encadenamientoDoc) {
      await storage().actualizar(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, ID_ENCADENAMIENTO, nuevoEncadenamiento);
    } else {
      await storage().insertar(INSTANCIA_VERIFACTU, COLECCION_VERIFACTU, { id: ID_ENCADENAMIENTO, ...nuevoEncadenamiento });
    }

    const xml = Buffer.from(resultado.verifactuXml, "base64").toString("utf-8");
    return c.json(
      { qrcode: resultado.qrcode, xml, hash: resultado.hash, endpoint: resultado.endpoint, entorno: "pruebas" as const },
      200,
    );
  });
}
