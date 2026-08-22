import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectorRegistry, FxConnector, MarketDataConnector } from "connectors-core";
import { requireConnector } from "../helpers";

const CotizacionSchema = z
  .object({
    simbolo: z.string(),
    nombre: z.string(),
    precio: z.number(),
    variacion24h: z.number(),
    moneda: z.string(),
    actualizado: z.string(),
  })
  .openapi("Cotizacion");

const QueryCotizaciones = z.object({
  simbolos: z.string().openapi({
    param: { name: "simbolos", in: "query" },
    example: "BTC,ETH",
    description: "Símbolos separados por coma",
  }),
});

const rutaCotizar = createRoute({
  method: "get",
  path: "/cotizaciones",
  tags: ["market-data"],
  summary: "Cotización de mercado de una lista de símbolos (kind: market-data)",
  request: { query: QueryCotizaciones },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(CotizacionSchema) } },
      description: "Cotizaciones encontradas",
    },
  },
});

const QueryTipoCambio = z.object({
  origen: z.string().openapi({ param: { name: "origen", in: "query" }, example: "USD" }),
  destino: z.string().openapi({ param: { name: "destino", in: "query" }, example: "EUR" }),
});

const rutaTipoCambio = createRoute({
  method: "get",
  path: "/tipocambio",
  tags: ["fx"],
  summary: "Tipo de cambio entre dos divisas (kind: fx)",
  request: { query: QueryTipoCambio },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ origen: z.string(), destino: z.string(), tasa: z.number() }) },
      },
      description: "Tasa de cambio",
    },
  },
});

/** Ejemplo de kind "market-data" (cotizaciones) y "fx" (tipo de cambio) */
export function registerQuotesRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  app.openapi(rutaCotizar, async (c) => {
    const { simbolos } = c.req.valid("query");
    const marketData = requireConnector<MarketDataConnector>(registry, "market-data");
    const mapa = await marketData.cotizar(
      simbolos
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    return c.json([...mapa.values()], 200);
  });

  app.openapi(rutaTipoCambio, async (c) => {
    const { origen, destino } = c.req.valid("query");
    const fx = requireConnector<FxConnector>(registry, "fx");
    const tasa = await fx.obtenerTasa(origen, destino);
    return c.json({ origen: origen.toUpperCase(), destino: destino.toUpperCase(), tasa }, 200);
  });
}
