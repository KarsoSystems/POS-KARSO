import { centavos, pesos } from "./cotizacion";

// Reglas puras del pago en línea (KARSO-PROMPT-v1.md 5.6, 6.5 y 6.10): folio por
// año, plazo para pagar y lo cobrado. El servidor las usa al confirmar, al pagar y
// al revisar el vencimiento; el front, para mostrar la hora límite.

/** "KAR-2026-000001": un consecutivo por año, de 6 dígitos. */
export function formatFolio(anio: number, consecutivo: number): string {
  return `KAR-${anio}-${String(consecutivo).padStart(6, "0")}`;
}

/** Año de `fecha` en `zonaHoraria`: el 31 de diciembre a las 23:30 en CDMX todavía es ese año. */
export function anioEn(fecha: Date, zonaHoraria: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: zonaHoraria, year: "numeric" }).format(fecha));
}

/** Fecha ISO límite para pagar: la confirmación más `horas`. */
export function vencimientoPago(confirmadoAt: string, horas: number): string {
  return new Date(Date.parse(confirmadoAt) + horas * 60 * 60 * 1000).toISOString();
}

/** El pago venció: sigue en `pago_pendiente` y ya llegó la hora límite. */
export function venceElPago(
  pedido: { estatus: string; vencimientoPago: string | null },
  ahora: Date = new Date(),
): boolean {
  return (
    pedido.estatus === "pago_pendiente" &&
    pedido.vencimientoPago !== null &&
    ahora.getTime() >= Date.parse(pedido.vencimientoPago)
  );
}

/** Lo cobrado (solo pagos aprobados) y lo que falta, en pesos; por dentro, en centavos. */
export function resumenPagos(
  pagos: { monto: number; estatus: "aprobado" | "rechazado" | "pendiente" }[],
  total: number,
): { pagado: number; saldo: number } {
  const pagado = pagos.filter((p) => p.estatus === "aprobado").reduce((suma, p) => suma + centavos(p.monto), 0);
  return { pagado: pesos(pagado), saldo: pesos(centavos(total) - pagado) };
}
