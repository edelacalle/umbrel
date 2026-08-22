import type { Connector } from "../types";

/**
 * kind: "blockchain" — lectura on-chain de saldos nativos de una red
 * (BTC, ETH...) vía un endpoint público (explorer, RPC). Solo lectura: este
 * kind no está pensado para firmar ni enviar transacciones.
 */
export interface BlockchainConnector extends Connector {
  redesSoportadas(): string[];
  /** Saldo nativo (no de un token/contrato) de `wallet` en la red indicada */
  consultarSaldoNativo(red: string, wallet: string): Promise<number>;
}
