import { z } from "zod";

// Reglas compartidas por cliente (editor de ítem, subida) y servidor (route handlers).

export const MAX_ITEMS_POR_PEDIDO = 20;
export const CANTIDAD_MINIMA = 1;
export const CANTIDAD_MAXIMA = 100_000;
export const DESCRIPCION_MAXIMA = 500;

// ── Archivos (SPEC 05) ──────────────────────────────────────────────────────

// Tope global al subir; cada producto puede pedir menos (`pesoMaximoMB`), y eso
// solo advierte (src/lib/pedidos/archivo-linea.ts).
export const TAMANO_MAXIMO_ARCHIVO_BYTES = 41_943_040; // 40 MB

/** La unión de los formatos del catálogo: imágenes que se leen y vectores que no. */
export const EXTENSIONES_PERMITIDAS = ["jpg", "jpeg", "tiff", "pdf", "ai", "eps", "svg"] as const;
export type ExtensionPermitida = (typeof EXTENSIONES_PERMITIDAS)[number];

/** `Content-Type` fijo por extensión: nunca se usa el que manda el navegador. */
export const MIME_POR_EXTENSION: Record<ExtensionPermitida, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  tiff: "image/tiff",
  pdf: "application/pdf",
  ai: "application/postscript",
  eps: "application/postscript",
  svg: "image/svg+xml",
};

/** Atributo `accept` del input de archivo. */
export const ACCEPT_ARCHIVOS = EXTENSIONES_PERMITIDAS.map((ext) => `.${ext}`).join(",");

/** Extensión permitida del nombre (sin importar mayúsculas) o `null`. */
export function extensionPermitida(nombre: string): ExtensionPermitida | null {
  const punto = nombre.lastIndexOf(".");
  if (punto < 0) return null;
  const ext = nombre.slice(punto + 1).toLowerCase();
  return (EXTENSIONES_PERMITIDAS as readonly string[]).includes(ext) ? (ext as ExtensionPermitida) : null;
}

/** JPG, JPEG y TIFF se leen con sharp (px, color, miniatura); el resto son vectores. */
export function esImagen(extension: ExtensionPermitida): boolean {
  return extension === "jpg" || extension === "jpeg" || extension === "tiff";
}

export const MENSAJE_FORMATO_NO_PERMITIDO = "Formato no permitido";
export const MENSAJE_ARCHIVO_GRANDE = "El archivo supera 40 MB";

/** Paso 1 de la subida: pedir la URL firmada. Formato y tope se revisan aparte (415 y 413). */
export const solicitudSubidaSchema = z.object({
  nombre: z.string({ error: "Elige un archivo" }).trim().min(1, "Elige un archivo"),
  bytes: z
    .number({ error: "El tamaño debe ser un número" })
    .int("El tamaño debe ser un número entero")
    .positive("El archivo está vacío"),
});

// ── Línea de KARSO (SPEC 04) ────────────────────────────────────────────────

const idSchema = (campo: string) =>
  z.string({ error: `${campo} es obligatorio` }).trim().min(1, `${campo} es obligatorio`);

const medidaSchema = (campo: string) =>
  z.number({ error: `${campo} debe ser un número` }).positive(`${campo} debe ser mayor que 0`);

export const cantidadSchema = z
  .number({ error: "La cantidad debe ser un número" })
  .int("La cantidad debe ser un número entero")
  .min(CANTIDAD_MINIMA, `La cantidad mínima es ${CANTIDAD_MINIMA}`)
  .max(CANTIDAD_MAXIMA, "La cantidad máxima es 100,000");

export const descripcionSchema = z
  .string()
  .trim()
  .max(DESCRIPCION_MAXIMA, `La descripción no puede tener más de ${DESCRIPCION_MAXIMA} caracteres`);

// Las reglas que dependen del catálogo (variante en línea, rango de la medida,
// especificaciones aplicables, cantidad mínima) las valida `evaluarLinea`.

export const medidaCapturadaSchema = z.object({
  ancho: medidaSchema("El ancho"),
  alto: medidaSchema("El alto"),
});

export const TEXTO_REVERSO_MAXIMO = 500;

/** Reverso de la línea (SPEC 05): el archivo del cliente, o un calendario o texto que diseña la imprenta. */
export const reversoSchema = z.discriminatedUnion(
  "tipo",
  [
    z.object({ tipo: z.literal("archivo"), archivoId: idSchema("El archivo del reverso") }),
    // El año permitido (actual o siguiente) depende de la fecha: lo valida evaluarLinea.
    z.object({ tipo: z.literal("calendario"), anio: z.number({ error: "Elige el año" }).int("Elige el año") }),
    z.object({
      tipo: z.literal("texto"),
      texto: z
        .string({ error: "Escribe el texto del reverso" })
        .trim()
        .min(1, "Escribe el texto del reverso")
        .max(TEXTO_REVERSO_MAXIMO, `El texto no puede tener más de ${TEXTO_REVERSO_MAXIMO} caracteres`),
    }),
  ],
  { error: "Elige el reverso" },
);

// Si el frente o el reverso son obligatorios depende de la variante: lo valida evaluarLinea.
export const archivosLineaSchema = z.object({
  frente: idSchema("El archivo").nullable().default(null),
  reverso: reversoSchema.nullable().default(null),
});

export const lineaSchema = z.object({
  archivos: archivosLineaSchema,
  descripcion: descripcionSchema.default(""),
  productoId: idSchema("El producto"),
  varianteId: idSchema("La variante"),
  medida: medidaCapturadaSchema.nullable().default(null), // solo variantes de medida variable
  especificaciones: z
    .array(z.number({ error: "Acabado inválido" }).int("Acabado inválido"))
    .refine((ids) => new Set(ids).size === ids.length, "Un acabado está repetido")
    .default([]),
  cantidad: cantidadSchema,
});

export type MedidaCapturada = z.output<typeof medidaCapturadaSchema>;
export type ReversoInput = z.output<typeof reversoSchema>;
export type ArchivosLineaData = z.output<typeof archivosLineaSchema>;
export type LineaInput = z.input<typeof lineaSchema>;
export type LineaData = z.output<typeof lineaSchema>;

