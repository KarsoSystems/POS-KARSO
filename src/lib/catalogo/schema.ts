import { z } from "zod";

// Esquema de los productos de KARSO (KARSO-PROMPT-v1.md, secciones 5.2–5.3 y 6.4).
// Compartido por cliente y servidor: el servidor valida el mock del panel
// (config/mock-panel/productos.json) al cargarlo y el front usa los tipos.
// Los montos van en pesos, sin IVA, como en los ejemplos de KARSO.

const idSchema = z.string().trim().min(1, "El id es obligatorio");
const nombreSchema = z.string().trim().min(1, "El nombre es obligatorio");
const pesosSchema = z.number().nonnegative("El monto no puede ser negativo");
const fechaSchema = z.iso.datetime({ message: "Fecha ISO 8601 inválida" });

export const CANALES = ["en_linea", "mostrador"] as const;
export const VOLUMENES = ["millar", "unidad", "paquete"] as const;
export const PRECIOS_POR = ["volumen", "m2", "metro_lineal", "cotizacion"] as const;
export const TIPOS_COBRO = ["fijo", "por_volumen", "por_m2", "por_metro_lineal", "por_pieza"] as const;
export const CARAS = ["obligatorio", "opcional", "no_aplica"] as const;

export const reglasArchivoSchema = z.object({
  requiereArchivo: z.boolean(),
  formatos: z.array(z.string().trim().min(1)),
  colorRequerido: z.enum(["CMYK", "RGB", "cualquiera"]),
  resolucionMinima: z.number().positive(),
  pesoMaximoMB: z.number().positive(),
  validarMedida: z.boolean(),
});

const rangoSchema = z
  .object({ min: z.number().positive("La medida debe ser mayor que 0"), max: z.number().positive() })
  .refine((rango) => rango.min <= rango.max, { message: "min no puede ser mayor que max", path: ["min"] });

export const medidaVarianteSchema = z
  .object({
    tipo: z.enum(["fija", "variable"]),
    unidad: z.enum(["cm", "m"]),
    ancho: rangoSchema,
    alto: rangoSchema,
    rebase: z.number().nonnegative(),
    tolerancia: z.number().nonnegative(),
    permiteGirar: z.boolean(),
    medidasRapidas: z.array(
      z.object({ nombre: nombreSchema, ancho: z.number().positive(), alto: z.number().positive() }),
    ),
  })
  .superRefine((medida, ctx) => {
    if (medida.tipo !== "fija") return;
    for (const eje of ["ancho", "alto"] as const) {
      if (medida[eje].min !== medida[eje].max) {
        ctx.addIssue({
          code: "custom",
          path: [eje, "max"],
          message: "En medida fija, min y max deben ser iguales",
        });
      }
    }
  });

export const varianteSchema = z
  .object({
    varianteId: idSchema,
    sku: idSchema,
    nombre: nombreSchema,
    grupoArmado: z.string().trim().min(1).nullable(),
    atributos: z.record(z.string(), z.string().trim().min(1)),
    medida: medidaVarianteSchema,
    volumen: z.enum(VOLUMENES),
    piezasPorPaquete: z.number().int().positive().nullable(),
    cantidadMinima: z.number().int().positive(),
    precioPor: z.enum(PRECIOS_POR),
    precio: pesosSchema,
    cobroMinimo: pesosSchema,
    diasEntrega: z.number().int().nonnegative(),
    caras: z.object({ frente: z.enum(CARAS), reverso: z.enum(CARAS) }),
    canales: z.array(z.enum(CANALES)).min(1, "La variante debe venderse en al menos un canal"),
    activa: z.boolean(),
    archivo: reglasArchivoSchema.partial().optional(),
  })
  .superRefine((variante, ctx) => {
    const esPaquete = variante.volumen === "paquete";
    if (esPaquete !== (variante.piezasPorPaquete !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["piezasPorPaquete"],
        message: esPaquete
          ? "piezasPorPaquete es obligatorio con volumen paquete"
          : "piezasPorPaquete solo aplica con volumen paquete",
      });
    }
  });

export const especificacionSchema = z
  .object({
    id: z.number().int().positive(),
    nombre: nombreSchema,
    tipoCobro: z.enum(TIPOS_COBRO),
    precio: pesosSchema,
    cadaMetros: z.number().positive().optional(),
    precioTexto: nombreSchema,
    variantes: z.array(idSchema).nullable(), // null = todas las variantes del producto
    activa: z.boolean(),
  })
  .superRefine((especificacion, ctx) => {
    const porPieza = especificacion.tipoCobro === "por_pieza";
    if (porPieza !== (especificacion.cadaMetros !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["cadaMetros"],
        message: porPieza ? "cadaMetros es obligatorio con por_pieza" : "cadaMetros solo aplica con por_pieza",
      });
    }
  });

export const productoSchema = z.object({
  _id: idSchema,
  nombre: nombreSchema,
  categoria: nombreSchema,
  descripcion: z.string().trim(),
  imagen: z.string().trim().min(1),
  idSocio: z.number().int().nonnegative(),
  sucursales: z.array(idSchema),
  activo: z.boolean(),
  orden: z.number().int(),
  requiereArmado: z.boolean(),
  archivo: reglasArchivoSchema,
  variantes: z.array(varianteSchema).min(1, "El producto debe tener al menos una variante"),
  especificaciones: z.array(especificacionSchema),
  condicionesEspeciales: z.array(z.string()),
  creadoEn: fechaSchema,
  actualizadoEn: fechaSchema,
});

/** Agrega un error por cada valor repetido de `campo` en `items`. */
function unicos<T>(
  items: T[],
  valor: (item: T) => string | number,
  ruta: (i: number) => (string | number)[],
  etiqueta: string,
  vistos: Set<string | number>,
  ctx: z.RefinementCtx,
): void {
  items.forEach((item, i) => {
    const v = valor(item);
    if (vistos.has(v)) ctx.addIssue({ code: "custom", path: ruta(i), message: `${etiqueta} repetido: "${v}"` });
    vistos.add(v);
  });
}

export const productosArchivoSchema = z
  .object({
    version: z.literal(1),
    ejemplo: z.boolean(), // true → la UI muestra "Precios de ejemplo"
    supuestos: z.array(z.string()).optional(), // datos que KARSO no fija; solo documentación
    productos: z.array(productoSchema),
  })
  .superRefine((archivo, ctx) => {
    const ids = new Set<string | number>();
    const skus = new Set<string | number>();
    const variantesIds = new Set<string | number>();
    unicos(archivo.productos, (p) => p._id, (i) => ["productos", i, "_id"], "Id", ids, ctx);

    archivo.productos.forEach((producto, i) => {
      const base = ["productos", i, "variantes"];
      unicos(producto.variantes, (v) => v.sku, (j) => [...base, j, "sku"], "SKU", skus, ctx);
      unicos(producto.variantes, (v) => v.varianteId, (j) => [...base, j, "varianteId"], "varianteId", variantesIds, ctx);
      unicos(
        producto.especificaciones,
        (e) => e.id,
        (j) => ["productos", i, "especificaciones", j, "id"],
        "Id de especificación",
        new Set(),
        ctx,
      );

      const propias = new Set(producto.variantes.map((v) => v.varianteId));
      producto.especificaciones.forEach((especificacion, j) => {
        especificacion.variantes?.forEach((varianteId, k) => {
          if (!propias.has(varianteId)) {
            ctx.addIssue({
              code: "custom",
              path: ["productos", i, "especificaciones", j, "variantes", k],
              message: `La variante "${varianteId}" no existe en el producto`,
            });
          }
        });
      });
    });
  });

export type Canal = (typeof CANALES)[number];
export type Volumen = (typeof VOLUMENES)[number];
export type PrecioPor = (typeof PRECIOS_POR)[number];
export type TipoCobro = (typeof TIPOS_COBRO)[number];
export type Cara = (typeof CARAS)[number];
export type ReglasArchivo = z.infer<typeof reglasArchivoSchema>;
export type MedidaVariante = z.infer<typeof medidaVarianteSchema>;
export type Variante = z.infer<typeof varianteSchema>;
export type Especificacion = z.infer<typeof especificacionSchema>;
export type Producto = z.infer<typeof productoSchema>;
export type ProductosArchivo = z.infer<typeof productosArchivoSchema>;
