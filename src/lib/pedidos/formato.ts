// Formato para mostrar pedidos en la UI (es-MX).

import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import { enZona } from "./entrega";

/**
 * Estatus del pedido de KARSO 6.5, más `borrador`, propio del demo (el carrito en
 * el servidor). La tienda produce `pago_pendiente`, `enviado` y `cancelado`; los
 * demás los asigna el panel (SPEC 08).
 */
export const ESTATUS_PEDIDO = [
  "borrador",
  "pago_pendiente",
  "enviado",
  "recibido",
  "en_proceso",
  "listo",
  "entregado",
  "rechazado",
  "cancelado",
] as const;

export type EstatusPedido = (typeof ESTATUS_PEDIDO)[number];

export const ETIQUETA_ESTATUS: Record<EstatusPedido, string> = {
  borrador: "Borrador",
  pago_pendiente: "Pago pendiente",
  enviado: "Enviado",
  recibido: "Recibido",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** 2500 → "$2,500.00". Los montos de KARSO van en pesos. */
export function formatearMxn(pesos: number): string {
  return mxn.format(pesos);
}

// En la zona horaria de la tienda, no en la del navegador: la hora límite para
// pagar es la misma para todos los clientes (SPEC 07).
const fecha = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ZONA_HORARIA_TIENDA,
});
const fechaHora = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: ZONA_HORARIA_TIENDA,
});

/** "30 oct 2026". */
export function formatearFecha(iso: string): string {
  return fecha.format(new Date(iso));
}

/** "30 oct 2026, 12:00". */
export function formatearFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso));
}

/** 1000 → "1,000". */
export function formatearNumero(n: number): string {
  return n.toLocaleString("es-MX");
}

/** 33 → "33", 48.3 → "48.3". */
export function formatearCm(cm: number): string {
  return String(Math.round(cm * 100) / 100);
}

// ── KARSO: cantidad, medida y precio (SPEC 04) ─────────────────────────────

type Volumen = "millar" | "unidad" | "paquete";

const plural = (n: number, singular: string, varios: string) => (n === 1 ? singular : varios);

/** Unidad de la cantidad para el campo del editor: "millares", "paquetes de 100", "piezas". */
export function unidadCantidad(volumen: Volumen, piezasPorPaquete: number | null, cantidad = 2): string {
  if (volumen === "millar") return plural(cantidad, "millar", "millares");
  if (volumen === "paquete") return `${plural(cantidad, "paquete", "paquetes")} de ${formatearNumero(piezasPorPaquete ?? 1)}`;
  return plural(cantidad, "pieza", "piezas");
}

/** "2 millares (2,000 piezas)", "3 paquetes de 100 (300 piezas)", "2 piezas". */
export function textoCantidad(volumen: Volumen, cantidad: number, piezasPorPaquete: number | null): string {
  const unidad = `${formatearNumero(cantidad)} ${unidadCantidad(volumen, piezasPorPaquete, cantidad)}`;
  if (volumen === "unidad") return unidad;
  const piezas = cantidad * (volumen === "millar" ? 1000 : (piezasPorPaquete ?? 1));
  return `${unidad} (${formatearNumero(piezas)} ${plural(piezas, "pieza", "piezas")})`;
}

/** 1.5 → "1.50": las medidas en metros siempre con 2 decimales. */
export function formatearM(m: number): string {
  return m.toFixed(2);
}

interface MedidaTexto {
  unidad: "cm" | "m";
  ancho: number;
  alto: number;
  area: number | null;
}

/** "8.7 × 5 cm", "2.00 × 1.50 m · 3.00 m²". */
export function textoMedida(medida: MedidaTexto): string {
  const f = medida.unidad === "m" ? formatearM : formatearCm;
  const base = `${f(medida.ancho)} × ${f(medida.alto)} ${medida.unidad}`;
  return medida.area === null ? base : `${base} · ${formatearM(medida.area)} m²`;
}

const POR_PRECIO = {
  m2: "por m²",
  metro_lineal: "por metro lineal",
  cotizacion: "por cotización",
} as const;

/** Precio de catálogo de una variante: "$1,280.00 por millar", "$55.00 por m²". */
export function textoPrecioVariante(variante: {
  precio: number;
  precioPor: "volumen" | "m2" | "metro_lineal" | "cotizacion";
  volumen: Volumen;
  piezasPorPaquete: number | null;
}): string {
  const por =
    variante.precioPor === "volumen"
      ? `por ${unidadCantidad(variante.volumen, variante.piezasPorPaquete, 1)}`
      : POR_PRECIO[variante.precioPor];
  return `${formatearMxn(variante.precio)} ${por}`;
}

/** 46_000 → "45 KB"; 3_355_443 → "3.2 MB". */
export function formatearPeso(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface DatosArchivo {
  extension: string;
  bytes: number;
  metadatos: { anchoPx: number | null; altoPx: number | null; color: "CMYK" | "RGB" | "otro" | null } | null;
}

/** "TIFF · CMYK · 1098 × 661 px · 3.2 MB"; de un vector o una imagen ilegible, "PDF · 3.2 MB". */
export function textoDatosArchivo({ extension, bytes, metadatos }: DatosArchivo): string {
  const partes = [extension.toUpperCase()];
  if (metadatos?.color) partes.push(metadatos.color === "otro" ? "Otro color" : metadatos.color);
  if (metadatos?.anchoPx && metadatos.altoPx) partes.push(`${metadatos.anchoPx} × ${metadatos.altoPx} px`);
  partes.push(formatearPeso(bytes));
  return partes.join(" · ");
}

export const LARGO_TEXTO_RECORTADO = 60;

/** Reverso de calendario o texto para el resumen: "Calendario 2027" o "“Oración a…”" recortado. */
export function textoReverso(reverso: { tipo: "calendario"; anio: number } | { tipo: "texto"; texto: string }): string {
  if (reverso.tipo === "calendario") return `Calendario ${reverso.anio}`;
  const texto = reverso.texto.replace(/\s+/g, " ").trim();
  const recortado =
    texto.length > LARGO_TEXTO_RECORTADO ? `${texto.slice(0, LARGO_TEXTO_RECORTADO - 1).trimEnd()}…` : texto;
  return `Texto: “${recortado}”`;
}

// Días sin hora ("YYYY-MM-DD", ya en la zona de la tienda): se formatean en UTC
// para que el navegador no los corra un día.
const diaSemana = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" });
const diaMes = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-07" → "sábado 7 nov": para "Disponible para recoger a partir del sábado 7 nov". */
export function formatearDia(dia: string): string {
  const fecha = new Date(`${dia}T00:00:00Z`);
  return `${diaSemana.format(fecha)} ${diaMes.format(fecha)}`;
}

/** Un instante ISO como el día de la tienda: "Corrige antes del sábado 7 nov" (SPEC 09). */
export function formatearDiaDe(iso: string): string {
  return formatearDia(enZona(new Date(iso), ZONA_HORARIA_TIENDA).dia);
}

/** Antes de validar el pedido: "5 días hábiles" o "el mismo día". */
export function textoDiasHabiles(dias: number): string {
  if (dias === 0) return "el mismo día";
  return `${dias} ${dias === 1 ? "día hábil" : "días hábiles"}`;
}
