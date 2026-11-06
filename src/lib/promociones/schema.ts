import { z } from "zod";
import { CANALES } from "@/lib/catalogo/schema";

// Esquema de las promociones de KARSO (KARSO-PROMPT-v1.md 5.5 y 6.6). El servidor
// valida el mock del panel (config/mock-panel/promociones.json). Los códigos nunca
// se listan al front: solo se validan cuando el cliente escribe uno.

const fechaSchema = z.iso.datetime({ message: "Fecha ISO 8601 inválida" });
const limiteSchema = z.number().int().positive().nullable(); // null = sin límite

export const promocionSchema = z.object({
  _id: z.string().trim().min(1, "El id es obligatorio"),
  codigo: z
    .string()
    .trim()
    .min(1, "El código es obligatorio")
    .refine((c) => c === c.toUpperCase(), "El código debe ir en mayúsculas"),
  descripcion: z.string().trim(),
  porcentaje: z.number().positive("El porcentaje debe ser mayor que 0").max(100, "El porcentaje no puede pasar de 100"),
  vigencia: z
    .object({ inicio: fechaSchema, fin: fechaSchema })
    .refine((v) => v.inicio <= v.fin, { message: "inicio no puede ser posterior a fin", path: ["inicio"] }),
  usosMaximos: limiteSchema,
  usosPorCliente: limiteSchema,
  usosActuales: z.number().int().nonnegative(), // lo lleva el panel; la tienda no lo lee ni lo escribe
  canales: z.array(z.enum(CANALES)).min(1, "La promoción debe aplicar en al menos un canal"),
  activa: z.boolean(),
  creadoPor: z.string().trim().min(1),
  creadoEn: fechaSchema,
  actualizadoEn: fechaSchema,
});

export const promocionesArchivoSchema = z
  .object({
    version: z.literal(1),
    promociones: z.array(promocionSchema),
  })
  .superRefine((archivo, ctx) => {
    const ids = new Set<string>();
    const codigos = new Set<string>();
    archivo.promociones.forEach((promocion, i) => {
      if (ids.has(promocion._id)) {
        ctx.addIssue({ code: "custom", path: ["promociones", i, "_id"], message: `Id repetido: "${promocion._id}"` });
      }
      if (codigos.has(promocion.codigo)) {
        ctx.addIssue({ code: "custom", path: ["promociones", i, "codigo"], message: `Código repetido: "${promocion.codigo}"` });
      }
      ids.add(promocion._id);
      codigos.add(promocion.codigo);
    });
  });

export type Promocion = z.infer<typeof promocionSchema>;
export type PromocionesArchivo = z.infer<typeof promocionesArchivoSchema>;
