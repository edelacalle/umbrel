import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { BlockchainConnector, ConnectorRegistry } from "connectors-core";
import { requireConnector } from "../helpers";

const ParamsRedWallet = z.object({
  red: z.string().openapi({ param: { name: "red", in: "path" }, example: "bitcoin" }),
  wallet: z.string().openapi({ param: { name: "wallet", in: "path" } }),
});

const rutaSaldo = createRoute({
  method: "get",
  path: "/onchain/{red}/{wallet}",
  tags: ["blockchain"],
  summary: "Saldo nativo on-chain de una wallet (kind: blockchain)",
  request: { params: ParamsRedWallet },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ red: z.string(), wallet: z.string(), saldo: z.number() }) },
      },
      description: "Saldo nativo de la wallet en esa red",
    },
    400: { description: "Red no soportada" },
    502: { description: "Fallo consultando la fuente on-chain" },
  },
});

/** Ejemplo de kind "blockchain": lectura de saldo nativo, no de tokens/contratos */
export function registerOnChainRoutes(app: OpenAPIHono, registry: ConnectorRegistry): void {
  app.openapi(rutaSaldo, async (c) => {
    const { red, wallet } = c.req.valid("param");
    const chain = requireConnector<BlockchainConnector>(registry, "blockchain");
    const saldo = await chain.consultarSaldoNativo(red, wallet);
    return c.json({ red, wallet, saldo }, 200);
  });
}
