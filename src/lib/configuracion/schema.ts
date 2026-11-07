import { z } from "zod";

// Configuración general de KARSO (KARSO-PROMPT-v1.md 6.9): solo lo que usa la
// tienda hasta ahora. Los demás campos (pedidos, entregas…) llegan con sus specs.
// El servidor valida el mock del panel (config/mock-panel/configuracion.json).

export const MODOS_COMBINACION = ["suma", "cascada"] as const;

/**
 * Zona horaria de la tienda (decisión de la SPEC 07; KARSO 6.9 dice
 * "America/Monterrey", con el mismo desfase todo el año). El servidor usa
 * `zonaHoraria` de la configuración; la lógica pura que también corre en el front
 * (p. ej. el año del calendario del reverso) usa esta constante. Un test revisa
 * que coincidan.
 */
export const ZONA_HORARIA_TIENDA = "America/Mexico_City";

export const configuracionTiendaSchema = z.object({
  zonaHoraria: z.string().trim().min(1),
  iva: z.object({ tasa: z.number().min(0).max(1) }),
  promociones: z.object({
    maxCodigosPorPedido: z.number().int().positive(),
    modoCombinacion: z.enum(MODOS_COMBINACION),
    descuentoMaximoPorcentaje: z.number().positive().max(100),
  }),
  pedidos: z.object({
    horasExpiracionPagoPendiente: z.number().int().positive(), // KARSO 5.6: si no se paga, se cancela
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
