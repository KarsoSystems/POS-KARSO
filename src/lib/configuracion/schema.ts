import { z } from "zod";

// Configuración general de KARSO (KARSO-PROMPT-v1.md 6.9): solo lo que usa la
// tienda hasta ahora. Los demás campos (pedidos, entregas…) llegan con sus specs.
// El servidor valida el mock del panel (config/mock-panel/configuracion.json).

export const MODOS_COMBINACION = ["suma", "cascada"] as const;

export const configuracionTiendaSchema = z.object({
  zonaHoraria: z.string().trim().min(1),
  iva: z.object({ tasa: z.number().min(0).max(1) }),
  promociones: z.object({
    maxCodigosPorPedido: z.number().int().positive(),
    modoCombinacion: z.enum(MODOS_COMBINACION),
    descuentoMaximoPorcentaje: z.number().positive().max(100),
  }),
});

export const configuracionArchivoSchema = z.object({
  version: z.literal(1),
  ejemplo: z.boolean(),
  configuracion: configuracionTiendaSchema,
});

export type ModoCombinacion = (typeof MODOS_COMBINACION)[number];
export type ConfiguracionTienda = z.infer<typeof configuracionTiendaSchema>;
export type ConfiguracionArchivo = z.infer<typeof configuracionArchivoSchema>;
