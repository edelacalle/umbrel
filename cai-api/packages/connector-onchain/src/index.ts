import { BadRequestError, UpstreamError } from "connectors-core";
import type { BlockchainConnector, ConnectorHealth, ConnectorInfo } from "connectors-core";

export type RedSoportada = "bitcoin" | "ethereum" | "ton" | "solana";

export interface OnChainOptions {
  bitcoin: { explorerApi: string };
  ethereum: { rpcUrl: string };
  ton: { apiUrl: string };
  solana: { rpcUrl: string };
}

const ALIAS_RED: Record<string, RedSoportada> = {
  bitcoin: "bitcoin",
  btc: "bitcoin",
  ethereum: "ethereum",
  eth: "ethereum",
  ton: "ton",
  "the-open-network": "ton",
  toncoin: "ton",
  solana: "solana",
  sol: "solana",
};

function normalizarRed(red: string): RedSoportada | null {
  return ALIAS_RED[red.trim().toLowerCase()] ?? null;
}

interface RespuestaBitcoin {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
}

interface RespuestaRpc<T> {
  result?: T;
  error?: { message: string };
}

interface RespuestaToncenter {
  ok: boolean;
  result?: string;
}

/**
 * connector-onchain — kind: "blockchain".
 *
 * Consulta el saldo nativo (BTC, ETH, TON, SOL) de una wallet contra
 * endpoints públicos (explorer o RPC), configurables por opción — nunca
 * hardcodeados — para poder apuntar a un proveedor propio (Infura, un nodo
 * propio...) sin tocar código. Solo lectura del activo nativo de cada red:
 * no resuelve balances de tokens/contratos (no hay forma genérica de
 * derivar el contrato/jetton correcto a partir de un símbolo).
 */
export class OnChainConnector implements BlockchainConnector {
  readonly info: ConnectorInfo = {
    id: "onchain",
    kind: "blockchain",
    label: "On-chain (BTC/ETH/TON/SOL)",
    description: "Lectura de saldos nativos vía endpoints públicos de explorer/RPC",
  };

  constructor(private readonly config: OnChainOptions) {}

  async healthCheck(): Promise<ConnectorHealth> {
    return { ok: true, checkedAt: new Date().toISOString() };
  }

  redesSoportadas(): string[] {
    return ["bitcoin", "ethereum", "ton", "solana"];
  }

  async consultarSaldoNativo(red: string, wallet: string): Promise<number> {
    const clave = normalizarRed(red);
    if (!clave) {
      throw new BadRequestError(`La red "${red}" no está soportada para consulta on-chain`);
    }

    try {
      switch (clave) {
        case "bitcoin":
          return await this.consultarBitcoin(wallet);
        case "ethereum":
          return await this.consultarEthereum(wallet);
        case "ton":
          return await this.consultarTon(wallet);
        case "solana":
          return await this.consultarSolana(wallet);
      }
    } catch (e) {
      if (e instanceof BadRequestError) throw e;
      throw new UpstreamError(`Fallo consultando ${clave} on-chain: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async consultarBitcoin(wallet: string): Promise<number> {
    const resp = await fetch(`${this.config.bitcoin.explorerApi}/address/${wallet}`);
    if (!resp.ok) throw new Error(`El explorer de Bitcoin respondió HTTP ${resp.status}`);
    const datos = (await resp.json()) as RespuestaBitcoin;
    const satoshis = datos.chain_stats.funded_txo_sum - datos.chain_stats.spent_txo_sum;
    return satoshis / 1e8;
  }

  private async consultarEthereum(wallet: string): Promise<number> {
    const resp = await fetch(this.config.ethereum.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [wallet, "latest"] }),
    });
    if (!resp.ok) throw new Error(`El RPC de Ethereum respondió HTTP ${resp.status}`);
    const datos = (await resp.json()) as RespuestaRpc<string>;
    if (datos.error || !datos.result) {
      throw new Error(datos.error?.message ?? "Respuesta inválida del RPC de Ethereum");
    }
    return Number(BigInt(datos.result)) / 1e18;
  }

  private async consultarTon(wallet: string): Promise<number> {
    const resp = await fetch(`${this.config.ton.apiUrl}/getAddressBalance?address=${encodeURIComponent(wallet)}`);
    if (!resp.ok) throw new Error(`Toncenter respondió HTTP ${resp.status}`);
    const datos = (await resp.json()) as RespuestaToncenter;
    if (!datos.ok || datos.result === undefined) throw new Error("Respuesta inválida de Toncenter");
    return Number(datos.result) / 1e9;
  }

  private async consultarSolana(wallet: string): Promise<number> {
    const resp = await fetch(this.config.solana.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet] }),
    });
    if (!resp.ok) throw new Error(`El RPC de Solana respondió HTTP ${resp.status}`);
    const datos = (await resp.json()) as RespuestaRpc<{ value: number }>;
    if (datos.error || datos.result === undefined) {
      throw new Error(datos.error?.message ?? "Respuesta inválida del RPC de Solana");
    }
    return datos.result.value / 1e9;
  }
}
