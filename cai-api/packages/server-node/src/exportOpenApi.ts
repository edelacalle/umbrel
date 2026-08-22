import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "core";
import { buildApp, raizProyecto } from "./buildApp";
import { EnvSchema } from "./env";

/**
 * Vuelca el documento OpenAPI a un fichero estático (`openapi.json`), útil
 * para generar clientes o publicar la spec sin tener el server arrancado.
 * `pnpm openapi:export` desde la raíz del repo.
 */
const env = parseEnv(EnvSchema, process.env);
const app = buildApp(env);

const res = await app.request("/openapi.json");
const doc = await res.json();

const destino = path.join(raizProyecto, "openapi.json");
fs.writeFileSync(destino, JSON.stringify(doc, null, 2));
console.log(`OpenAPI exportado a ${destino}`);
