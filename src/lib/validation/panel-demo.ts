import { z } from "zod";

// Entradas del simulador del panel (SPEC 08): solo existe con DEMO_PANEL=1.

/** POST /api/demo-panel/pedidos/:id/lineas/:lineaId: producción mueve la línea. */
export const estatusLineaSchema = z.object({
  estatus: z.enum(["en_proceso", "listo"], { error: "Estatus de línea inválido" }),
});

/** POST /api/demo-panel/pedidos/:id/rechazar (SPEC 09): una o varias líneas, cada una con su motivo. */
export const rechazoSchema = z.object({
  lineas: z
    .array(
      z.object({
        lineaId: z.string().min(1, "Elige la línea"),
        motivo: z.string().min(1, "Elige el motivo"),
        comentario: z
          .string()
          .trim()
          .min(1, "Escribe un comentario para el cliente")
          .max(500, "El comentario no puede pasar de 500 caracteres"),
      }),
    )
    .min(1, "Marca al menos una línea")
    .refine((lineas) => new Set(lineas.map((l) => l.lineaId)).size === lineas.length, "Una línea va una sola vez"),
});

export type RechazoInput = z.infer<typeof rechazoSchema>;
