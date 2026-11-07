import { z } from "zod";

// Entradas del simulador del panel (SPEC 08): solo existe con DEMO_PANEL=1.

/** POST /api/demo-panel/pedidos/:id/lineas/:lineaId: producción mueve la línea. */
export const estatusLineaSchema = z.object({
  estatus: z.enum(["en_proceso", "listo"], { error: "Estatus de línea inválido" }),
});
