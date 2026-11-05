import { z } from "zod";

// Reglas compartidas por cliente (editor de ítem, subida) y servidor (route handlers).

export const MAX_ITEMS_POR_PEDIDO = 20;
export const CANTIDAD_MINIMA = 1;
export const CANTIDAD_MAXIMA = 100_000;
export const DESCRIPCION_MAXIMA = 500;

// ── Archivos ────────────────────────────────────────────────────────────────

export const TAMANO_MAXIMO_ARCHIVO_BYTES = 52_428_800; // 50 MB

export const EXTENSIONES_PERMITIDAS = ["jpg", "jpeg", "png", "pdf", "ai", "psd"] as const;
export type ExtensionPermitida = (typeof EXTENSIONES_PERMITIDAS)[number];

/** `Content-Type` fijo por extensión: nunca se usa el que manda el navegador. */
export const MIME_POR_EXTENSION: Record<ExtensionPermitida, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
  ai: "application/postscript",
  psd: "image/vnd.adobe.photoshop",
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

/** Solo JPG y PNG se dibujan en el navegador; PDF, AI y PSD se muestran como ícono. */
export function esPrevisualizable(extension: ExtensionPermitida): boolean {
  return extension === "jpg" || extension === "jpeg" || extension === "png";
}

export const MENSAJE_FORMATO_NO_PERMITIDO = "Formato no permitido";
export const MENSAJE_ARCHIVO_GRANDE = "El archivo supera 50 MB";

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

export const lineaSchema = z.object({
  archivoId: idSchema("El archivo"),
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
export type LineaInput = z.input<typeof lineaSchema>;
export type LineaData = z.output<typeof lineaSchema>;

