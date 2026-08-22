import "dotenv/config";
import { execSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { parseEnv } from "core";
import { buildApp } from "./buildApp";
import { EnvSchema } from "./env";

const env = parseEnv(EnvSchema, process.env);
const app = buildApp(env);
const port = Number(env.PORT);

const REINTENTOS_EADDRINUSE = 10;
const ESPERA_REINTENTO_MS = 300;

/**
 * En Windows, `tsx watch` (usado en `pnpm dev:node`) no siempre consigue matar el proceso anterior al
 * reiniciar por un cambio de fichero: el puerto queda ocupado por ese proceso zombi de forma indefinida
 * (no es solo lentitud del SO liberándolo — comprobado con reintentos de varios segundos). Sin esto, el
 * arranque nuevo revienta con EADDRINUSE y deja el proceso viejo — con código desactualizado — sirviendo
 * peticiones, dando la falsa impresión de que el hot-reload "no ve" los cambios del backend. Solo actúa
 * sobre el proceso que ocupa justo este puerto de desarrollo, y solo cuando de verdad hay un conflicto.
 */
function liberarPuertoWindows(puertoOcupado: number): void {
  if (process.platform !== "win32") return;
  try {
    const salida = execSync("netstat -ano -p tcp", { encoding: "utf-8" });
    for (const linea of salida.split("\n")) {
      const columnas = linea.trim().split(/\s+/);
      const [protocolo, direccionLocal, , estado, pid] = columnas;
      if (protocolo !== "TCP" || estado !== "LISTENING") continue;
      if (!direccionLocal?.endsWith(`:${puertoOcupado}`)) continue;
      const pidNumero = Number(pid);
      if (!pidNumero || pidNumero === process.pid) continue;
      try {
        execSync(`taskkill /PID ${pidNumero} /F`, { stdio: "ignore" });
      } catch {
        // el proceso ya pudo haber salido entre el netstat y el taskkill
      }
    }
  } catch {
    // best-effort: si netstat/taskkill no está disponible, seguimos con los reintentos simples
  }
}

function iniciar(reintentosRestantes = REINTENTOS_EADDRINUSE): void {
  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`caipyme backend (Node) escuchando en http://localhost:${info.port} — documentación en /docs`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && reintentosRestantes > 0) {
      liberarPuertoWindows(port);
      setTimeout(() => iniciar(reintentosRestantes - 1), ESPERA_REINTENTO_MS);
      return;
    }
    throw err;
  });
}

iniciar();
