import { DIAS_SEMANA, type Entregas } from "@/lib/configuracion/schema";

// Fecha de entrega de KARSO 5.9: días hábiles (lunes a sábado sin festivos, según
// la configuración), con corte de recepción. La calcula el servidor cuando el
// pedido pasa a `recibido` (como lo hará el backend); la tienda solo la muestra
// como "Disponible para recoger a partir del…".
//
// Los días van como "YYYY-MM-DD" en la zona horaria de la tienda; las cuentas se
// hacen sobre fechas sin hora (UTC a medianoche) para no depender del navegador.

/** Fecha y hora locales de `fecha` en `zona`: el día ("YYYY-MM-DD") y la hora ("HH:MM", 24 h). */
function enZona(fecha: Date, zona: string): { dia: string; hora: string } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);
const siguiente = (dia: string) => aDia(new Date(aFecha(dia).getTime() + 86_400_000));
const diaSemana = (dia: string) => DIAS_SEMANA[aFecha(dia).getUTCDay()];

/** El día hábil de la configuración para ese día (con su corte), o undefined si no se trabaja. */
function habil(dia: string, entregas: Entregas) {
  if (entregas.festivos.includes(dia)) return undefined;
  return entregas.diasHabiles.find((d) => d.dia === diaSemana(dia));
}

export const esDiaHabil = (dia: string, entregas: Entregas): boolean => habil(dia, entregas) !== undefined;

/** El siguiente día hábil después de `dia`. */
function siguienteHabil(dia: string, entregas: Entregas): string {
  let actual = siguiente(dia);
  // Acotado: una configuración sin días hábiles no pasa la validación del esquema.
  for (let i = 0; i < 366 && !esDiaHabil(actual, entregas); i++) actual = siguiente(actual);
  return actual;
}

/**
 * Día de recepción (KARSO 5.9): ese mismo día si es hábil y llega antes de su
 * corte; después del corte, en domingo o en festivo, el siguiente día hábil.
 */
export function diaDeRecepcion(fecha: Date | string, entregas: Entregas, zona: string): string {
  const { dia, hora } = enZona(new Date(fecha), zona);
  const hoy = habil(dia, entregas);
  return hoy && hora < hoy.corte ? dia : siguienteHabil(dia, entregas);
}

/** `dia` + `n` días hábiles (`n` = 0 → el mismo día). */
export function sumarDiasHabiles(dia: string, n: number, entregas: Entregas): string {
  let actual = dia;
  for (let i = 0; i < n; i++) actual = siguienteHabil(actual, entregas);
  return actual;
}

/** Fecha de entrega de una línea: día de recepción + `diasEntrega` días hábiles. */
export function fechaEntregaLinea(
  fechaInicioConteo: Date | string,
  diasEntrega: number,
  entregas: Entregas,
  zona: string,
): string {
  return sumarDiasHabiles(diaDeRecepcion(fechaInicioConteo, entregas, zona), diasEntrega, entregas);
}

/** Fecha de entrega del pedido: la más tardía de sus líneas (null si ninguna tiene). */
export function fechaEntregaPedido(lineas: { fechaEntregaEstimada: string | null }[]): string | null {
  const fechas = lineas.map((l) => l.fechaEntregaEstimada).filter((f): f is string => f !== null);
  return fechas.length === 0 ? null : fechas.sort().at(-1)!;
}

export type EstatusLinea = "recibido" | "en_proceso" | "listo";

/**
 * Estatus del pedido calculado con sus líneas (KARSO 5.8): todas `listo` → `listo`;
 * alguna `en_proceso` o `listo` → `en_proceso`; si no, `recibido`. Solo aplica
 * mientras el pedido está en producción (`recibido`, `en_proceso` o `listo`);
 * los demás estatus se manejan a nivel pedido y se quedan como están.
 */
export function estatusDelPedido<E extends string>(
  estatus: E,
  lineas: { estatus: EstatusLinea | null }[],
): E | EstatusLinea {
  if (estatus !== "recibido" && estatus !== "en_proceso" && estatus !== "listo") return estatus;
  if (lineas.length > 0 && lineas.every((l) => l.estatus === "listo")) return "listo";
  if (lineas.some((l) => l.estatus === "en_proceso" || l.estatus === "listo")) return "en_proceso";
  return "recibido";
}
