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

/** 250000 → "$2,500.00". */
export function formatearMxn(centavos: number): string {
  return mxn.format(centavos / 100);
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

interface CatalogoNombres {
  hojas: { id: string; nombre: string; anchoCm: number; altoCm: number }[];
  papeles: { id: string; nombre: string }[];
  productos: { id: string; nombre: string; tamanos: { id: string; nombre: string }[] }[];
}

interface ItemNombrable {
  productoId: string;
  tamano: { tipo: "predefinido"; tamanoId: string } | { tipo: "personalizado" };
  anchoCm: number;
  altoCm: number;
  papelId: string;
  hojaId: string;
}

/**
 * Nombres legibles de un ítem. Si el catálogo ya no tiene algo (el ítem tiene
 * `problema`), se muestra el id guardado para que el cliente sepa qué corregir.
 */
export function etiquetasItem(catalogo: CatalogoNombres, item: ItemNombrable) {
  const producto = catalogo.productos.find((p) => p.id === item.productoId);
  const medidas = `${formatearCm(item.anchoCm)} × ${formatearCm(item.altoCm)} cm`;
  const tamanoId = item.tamano.tipo === "predefinido" ? item.tamano.tamanoId : null;
  const tamanoNombre =
    tamanoId === null
      ? "Personalizado"
      : (producto?.tamanos.find((t) => t.id === tamanoId)?.nombre ?? tamanoId);
  const hoja = catalogo.hojas.find((h) => h.id === item.hojaId);
  return {
    producto: producto?.nombre ?? item.productoId,
    tamano: `${tamanoNombre} ${medidas}`,
    papel: catalogo.papeles.find((p) => p.id === item.papelId)?.nombre ?? item.papelId,
    hoja: hoja?.nombre ?? item.hojaId,
  };
}
