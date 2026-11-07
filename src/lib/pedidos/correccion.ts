import type { Entregas } from "@/lib/configuracion/schema";
import { diaSemana, enZona, siguiente } from "./entrega";

// Corrección de un pedido rechazado (KARSO 5.8; SPEC 09). El cliente tiene
// `diasParaCorregir` días para subir los archivos corregidos. Decisión del usuario:
// no cuentan los domingos (los días que no están en `entregas.diasHabiles`), pero
// los festivos sí (se trabaja en festivos), y el plazo vence al fin del último día,
// en la hora de la tienda. El servidor fija el límite al rechazar y revisa el
// vencimiento al leer, como con el pago (SPEC 07).

/** Motivo de la cancelación cuando vence el plazo (`cancelacion.motivo`); el detalle lo reconoce para hablar del reembolso. */
export const MOTIVO_SIN_CORRECCION = "No corrigió el archivo en el plazo";

/** Lo que estas reglas leen de un rechazo (KARSO 6.5 `rechazos`). */
export interface RechazoCorreccion {
  fecha: string;
  lineaId: string;
  fechaLimiteCorreccion: string;
  corregidoEn: string | null;
}

/** Un día cuenta para corregir si es día de la semana que se trabaja; los festivos no se descuentan. */
const cuentaParaCorregir = (dia: string, entregas: Entregas) =>
  entregas.diasHabiles.some((d) => d.dia === diaSemana(dia));

/** Instante (ms) en que empieza `dia` ("YYYY-MM-DD") en `zona`. */
function inicioDelDia(dia: string, zona: string): number {
  const utc = Date.parse(`${dia}T00:00:00Z`);
  // Desfase de la zona en ese instante; se recalcula una vez por si cruza un cambio de horario.
  const desfase = (t: number) => {
    const local = enZona(new Date(t), zona);
    return Date.parse(`${local.dia}T${local.hora}:00Z`) - t;
  };
  const aprox = utc - desfase(utc);
  return utc - desfase(aprox);
}

/**
 * Fecha límite (ISO) para corregir: el fin del `dias`-ésimo día que cuenta después
 * del rechazo (el día del rechazo no cuenta). Rechazado el lunes 2 nov 2026 con 5
 * días → sábado 7 nov a las 23:59:59.999 en la Ciudad de México.
 */
export function fechaLimiteCorreccion(fechaRechazo: Date | string, dias: number, entregas: Entregas, zona: string): string {
  let dia = enZona(new Date(fechaRechazo), zona).dia;
  for (let contados = 0; contados < dias; ) {
    dia = siguiente(dia);
    if (cuentaParaCorregir(dia, entregas)) contados++;
  }
  return new Date(inicioDelDia(siguiente(dia), zona) - 1).toISOString();
}

/** Los rechazos de la última ronda: los que comparten la fecha del más reciente. */
export function rechazosVigentes<R extends RechazoCorreccion>(pedido: { rechazos: R[] }): R[] {
  if (pedido.rechazos.length === 0) return [];
  const ultima = pedido.rechazos.map((r) => r.fecha).sort().at(-1);
  return pedido.rechazos.filter((r) => r.fecha === ultima);
}

/** La fecha límite de la ronda vigente, o null si no hay rechazos. */
export function limiteCorreccion(pedido: { rechazos: RechazoCorreccion[] }): string | null {
  return rechazosVigentes(pedido)[0]?.fechaLimiteCorreccion ?? null;
}

/** La corrección venció: el pedido sigue `rechazado` y ya pasó la fecha límite. */
export function venceLaCorreccion(
  pedido: { estatus: string; rechazos: RechazoCorreccion[] },
  ahora: Date = new Date(),
): boolean {
  const limite = limiteCorreccion(pedido);
  return pedido.estatus === "rechazado" && limite !== null && ahora.getTime() > Date.parse(limite);
}

/** Cada línea rechazada de la ronda vigente ya tiene su archivo nuevo. */
export function correccionCompleta(pedido: { rechazos: RechazoCorreccion[] }): boolean {
  const vigentes = rechazosVigentes(pedido);
  return vigentes.length > 0 && vigentes.every((r) => r.corregidoEn !== null);
}
