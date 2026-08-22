import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiApp } from "api";
import { ConnectorRegistry } from "connectors-core";
import { CoinGeckoConnector } from "connector-coingecko";
import { FacturaScriptsConnector } from "connector-facturascripts";
import { FrankfurterConnector } from "connector-fx";
import { JsonStorageConnector } from "connector-json";
import { OnChainConnector } from "connector-onchain";
import type { Env } from "./env";

const aquiDir = path.dirname(fileURLToPath(import.meta.url));
/** Raíz de container3/ (packages/server-node/src/../../../) */
export const raizProyecto = path.resolve(aquiDir, "..", "..", "..");

/**
 * Composición de connectors para esta imagen — a diferencia de
 * servers/node/src/buildApp.ts, aquí STORAGE_BACKEND=sqlite no es una
 * opción: container3 es un bundle esbuild sin node_modules ni binarios
 * nativos, así que solo registra el connector-json (puro JS).
 */
export function buildRegistry(env: Env): ConnectorRegistry {
  const registry = new ConnectorRegistry();

  const dataDir = path.join(raizProyecto, "data");
  registry.register(new JsonStorageConnector({ dataDir }));
  registry.register(new CoinGeckoConnector({ apiKey: env.COINGECKO_API_KEY }));
  registry.register(new FrankfurterConnector());
  registry.register(
    new FacturaScriptsConnector({ baseUrl: env.FACTURASCRIPTS_URL, apiKey: env.FACTURASCRIPTS_API_KEY }),
  );
  registry.register(
    new OnChainConnector({
      bitcoin: { explorerApi: env.BITCOIN_EXPLORER_API },
      ethereum: { rpcUrl: env.ETHEREUM_RPC_URL },
      ton: { apiUrl: env.TON_API_URL },
      solana: { rpcUrl: env.SOLANA_RPC_URL },
    }),
  );

  return registry;
}

export function buildApp(env: Env) {
  return createApiApp({ registry: buildRegistry(env) });
}
