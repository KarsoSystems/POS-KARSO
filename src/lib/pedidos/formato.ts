// Formato para mostrar pedidos en la UI (es-MX).

export type EstadoPedido = "borrador" | "pedido" | "en_proceso" | "entregado" | "cancelado";

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  borrador: "Borrador",
  pedido: "Pedido",
  en_proceso: "En proceso",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** 2500 → "$2,500.00". Los montos de KARSO van en pesos. */
export function formatearMxn(pesos: number): string {
  return mxn.format(pesos);
}

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
const fechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

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
