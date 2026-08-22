import type { z } from "@hono/zod-openapi";

/**
 * Valida un objeto de configuración (process.env en Node, o el binding `env`
 * de un Worker) contra un schema Zod. Punto único de entrada para que un
 * mismo schema de config sirva a ambos servers sin duplicar la validación.
 */
export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const detalle = result.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return result.data;
}
