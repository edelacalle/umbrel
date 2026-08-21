// Genera un único bundle JS puro (sin node_modules ni binarios nativos) a
// partir del entrypoint de server-node, inlineando todo el workspace
// (core, connectors-core, connector-json/coingecko/facturascripts/fx/onchain,
// api) y sus dependencias npm (hono, zod, @hono/*, dotenv, verifactu-node-lib).
import { build } from "esbuild";

await build({
  entryPoints: ["packages/server-node/src/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

console.log("Bundle generado en dist/server.mjs");
