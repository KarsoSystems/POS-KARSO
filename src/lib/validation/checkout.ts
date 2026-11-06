import { z } from "zod";
import { datosFiscalesSchema } from "./fiscal";

// Entradas del checkout del borrador (SPEC 06). Compartidas por el front y los route handlers.

/** PATCH /api/pedidos/borrador: cambios parciales; lo que no llega no cambia. */
export const checkoutSchema = z.object({
  sucursalEntregaId: z.string().trim().min(1, "Elige la sucursal de entrega").nullable().optional(),
  requiereFactura: z.boolean({ error: "Indica si requieres factura" }).optional(),
  datosFiscales: datosFiscalesSchema.nullable().optional(),
  /** Con `datosFiscales`: también los guarda en el perfil del usuario. */
  guardarDatosFiscales: z.boolean().optional(),
});

/** POST /api/pedidos/borrador/promociones. Mayúsculas y minúsculas dan igual. */
export const codigoPromocionSchema = z.object({
  codigo: z.string({ error: "Escribe el código" }).trim().min(1, "Escribe el código"),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;
