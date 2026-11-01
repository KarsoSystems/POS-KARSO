import { calcularAcomodo, type Acomodo, type Medidas } from "./acomodo";

// Presupuesto por hoja de impresión. Todo el dinero va en centavos enteros (MXN).
// Puro y compartido: el editor lo usa en vivo y el servidor recalcula y manda.

export interface PresupuestoItem {
  acomodo: Acomodo;
  hojas: number; // ⌈cantidad ÷ piezasPorHoja⌉
  precioHojaCentavos: number;
  subtotalCentavos: number; // hojas × precioHojaCentavos
}

export interface Totales {
  subtotalCentavos: number;
  ivaCentavos: number; // round(subtotal × tasaIva)
  totalCentavos: number;
  tasaIva: number;
}

export interface DatosPresupuestoItem {
  pieza: Medidas;
  hoja: Medidas;
  cantidad: number;
  precioHojaCentavos: number; // sin IVA
  margenCm: number;
  separacionCm: number;
}

/** Presupuesto de un ítem. Si la pieza no cabe en la hoja, hojas y subtotal quedan en 0. */
export function calcularPresupuestoItem(datos: DatosPresupuestoItem): PresupuestoItem {
  const acomodo = calcularAcomodo(datos.pieza, datos.hoja, datos.margenCm, datos.separacionCm);
  const hojas = acomodo.piezasPorHoja > 0 ? Math.ceil(datos.cantidad / acomodo.piezasPorHoja) : 0;
  return {
    acomodo,
    hojas,
    precioHojaCentavos: datos.precioHojaCentavos,
    subtotalCentavos: hojas * datos.precioHojaCentavos,
  };
}

/** Totales del pedido. El IVA se redondea una sola vez sobre el subtotal, no por ítem. */
export function calcularTotales(
  items: { presupuesto: Pick<PresupuestoItem, "subtotalCentavos"> }[],
  tasaIva: number,
): Totales {
  const subtotalCentavos = items.reduce((suma, item) => suma + item.presupuesto.subtotalCentavos, 0);
  const ivaCentavos = Math.round(subtotalCentavos * tasaIva);
  return {
    subtotalCentavos,
    ivaCentavos,
    totalCentavos: subtotalCentavos + ivaCentavos,
    tasaIva,
  };
}
