import { z } from "zod";

// Esquema del catálogo (config/catalogo.json). Compartido por cliente y servidor:
// el servidor valida el JSON al cargarlo y el front usa los tipos.

const idSchema = z.string().trim().min(1, "El id es obligatorio");
const nombreSchema = z.string().trim().min(1, "El nombre es obligatorio");
const medidaSchema = z.number().positive("La medida debe ser mayor que 0");

export const hojaSchema = z
  .object({
    id: idSchema,
    nombre: nombreSchema,
    anchoCm: medidaSchema,
    altoCm: medidaSchema,
  })
  .refine((hoja) => hoja.anchoCm < hoja.altoCm, {
    message: "La hoja va en orientación vertical: anchoCm debe ser menor que altoCm",
    path: ["anchoCm"],
  });

export const papelSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
  // Sin IVA, por hoja de impresión.
  precioHojaCentavos: z.record(
    z.string(),
    z.number().int("El precio va en centavos enteros").nonnegative("El precio no puede ser negativo"),
  ),
});

export const tamanoPredefinidoSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
  anchoCm: medidaSchema,
  altoCm: medidaSchema,
});

export const productoSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
  tamanos: z.array(tamanoPredefinidoSchema),
  papelesIds: z.array(idSchema).min(1, "El producto debe permitir al menos un papel"),
});

/** Agrega un error por cada id repetido dentro de `items`. */
function idsUnicos(
  items: { id: string }[],
  base: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const vistos = new Set<string>();
  items.forEach((item, i) => {
    if (vistos.has(item.id)) {
      ctx.addIssue({ code: "custom", path: [...base, i, "id"], message: `Id repetido: "${item.id}"` });
    }
    vistos.add(item.id);
  });
}

export const catalogoSchema = z
  .object({
    version: z.literal(1),
    ejemplo: z.boolean(), // true → la UI muestra "Precios de ejemplo"
    margenCm: z.number().nonnegative(),
    separacionCm: z.number().nonnegative(),
    tasaIva: z.number().min(0).max(1),
    hojas: z.array(hojaSchema).min(1, "Debe haber al menos una hoja"),
    papeles: z.array(papelSchema).min(1, "Debe haber al menos un papel"),
    productos: z.array(productoSchema).min(1, "Debe haber al menos un producto"),
  })
  .superRefine((catalogo, ctx) => {
    idsUnicos(catalogo.hojas, ["hojas"], ctx);
    idsUnicos(catalogo.papeles, ["papeles"], ctx);
    idsUnicos(catalogo.productos, ["productos"], ctx);

    const hojasIds = new Set(catalogo.hojas.map((h) => h.id));
    const papelesIds = new Set(catalogo.papeles.map((p) => p.id));

    // Cada papel tiene precio para todas las hojas, y solo para hojas que existen.
    catalogo.papeles.forEach((papel, i) => {
      for (const hojaId of hojasIds) {
        if (!(hojaId in papel.precioHojaCentavos)) {
          ctx.addIssue({
            code: "custom",
            path: ["papeles", i, "precioHojaCentavos", hojaId],
            message: `Falta el precio para la hoja "${hojaId}"`,
          });
        }
      }
      for (const hojaId of Object.keys(papel.precioHojaCentavos)) {
        if (!hojasIds.has(hojaId)) {
          ctx.addIssue({
            code: "custom",
            path: ["papeles", i, "precioHojaCentavos", hojaId],
            message: `La hoja "${hojaId}" no existe`,
          });
        }
      }
    });

    catalogo.productos.forEach((producto, i) => {
      idsUnicos(producto.tamanos, ["productos", i, "tamanos"], ctx);
      producto.papelesIds.forEach((papelId, j) => {
        if (!papelesIds.has(papelId)) {
          ctx.addIssue({
            code: "custom",
            path: ["productos", i, "papelesIds", j],
            message: `El papel "${papelId}" no existe`,
          });
        }
      });
    });
  });

export type Catalogo = z.infer<typeof catalogoSchema>;
export type Hoja = z.infer<typeof hojaSchema>;
export type Papel = z.infer<typeof papelSchema>;
export type Producto = z.infer<typeof productoSchema>;
export type TamanoPredefinido = z.infer<typeof tamanoPredefinidoSchema>;
