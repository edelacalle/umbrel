import { z } from "zod";

export const EnvSchema = z.object({
  PORT: z.string().default("8787"),
  COINGECKO_API_KEY: z.string().optional(),
  FACTURASCRIPTS_URL: z.string().default("http://localhost/facturas"),
  FACTURASCRIPTS_API_KEY: z.string().optional(),
  BITCOIN_EXPLORER_API: z.string().default("https://blockstream.info/api"),
  ETHEREUM_RPC_URL: z.string().default("https://ethereum-rpc.publicnode.com"),
  TON_API_URL: z.string().default("https://toncenter.com/api/v2"),
  SOLANA_RPC_URL: z.string().default("https://api.mainnet-beta.solana.com"),
});

export type Env = z.infer<typeof EnvSchema>;
