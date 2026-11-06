import type { ConfiguracionTienda } from "@/lib/configuracion/schema";
import type { Promocion } from "@/lib/promociones/schema";
import { centavos, pesos } from "./cotizacion";

// Promociones de KARSO (KARSO-PROMPT-v1.md 5.5). Puras: el servidor las usa al
// aplicar un código, al recalcular el borrador y al confirmar. Siempre por
// porcentaje y sobre el subtotal, antes del IVA. Los montos van en pesos; por
// dentro, en centavos enteros, como la cotización.

export type MotivoCodigoInvalido = "no_existe" | "no_vigente" | "vencida" | "otro_canal" | "agotada" | "ya_usada";

const MENSAJES: Record<MotivoCodigoInvalido, string> = {
  no_existe: "Este código no es válido",
  no_vigente: "Este código aún no está vigente",
  vencida: "Este código venció",
  otro_canal: "Este código solo es válido en sucursal",
  agotada: "Este código se agotó",
  ya_usada: "Ya usaste este código",
};

/** Para el aviso del borrador cuando un código aplicado deja de valer. */
const MOTIVOS_AVISO: Record<MotivoCodigoInvalido, string> = {
  no_existe: "ya no está disponible",
  no_vigente: "aún no está vigente",
  vencida: "venció",
  otro_canal: "solo es válido en sucursal",
  agotada: "se agotó",
  ya_usada: "ya lo usaste",
};

export type EvaluacionCodigo = { ok: true } | { ok: false; motivo: MotivoCodigoInvalido; mensaje: string };

/** "  buenFin10 " → "BUENFIN10". */
export const normalizarCodigo = (texto: string): string => texto.trim().toUpperCase();

export interface UsosCodigo {
  ahora: Date;
  /** Usos del código en pedidos no cancelados de todos los clientes. */
  usosTotales: number;
  /** Usos del código en pedidos no cancelados de este cliente. */
  usosDelCliente: number;
}

/** Si el código se puede aplicar a un pedido en línea. Una promoción inactiva responde como inexistente. */
export function evaluarCodigo(promocion: Promocion | undefined, { ahora, usosTotales, usosDelCliente }: UsosCodigo): EvaluacionCodigo {
  const falla = (motivo: MotivoCodigoInvalido): EvaluacionCodigo => ({ ok: false, motivo, mensaje: MENSAJES[motivo] });
  if (!promocion || !promocion.activa) return falla("no_existe");
  const t = ahora.getTime();
  if (t < Date.parse(promocion.vigencia.inicio)) return falla("no_vigente");
  if (t > Date.parse(promocion.vigencia.fin)) return falla("vencida");
  if (!promocion.canales.includes("en_linea")) return falla("otro_canal");
  if (promocion.usosMaximos !== null && usosTotales >= promocion.usosMaximos) return falla("agotada");
  if (promocion.usosPorCliente !== null && usosDelCliente >= promocion.usosPorCliente) return falla("ya_usada");
  return { ok: true };
}

/** "El código VERANO15 ya no es válido: venció". */
export const avisoCodigoInvalido = (codigo: string, motivo: MotivoCodigoInvalido): string =>
  `El código ${codigo} ya no es válido: ${MOTIVOS_AVISO[motivo]}`;

/**
 * Descuento de cada código, en el orden en que se aplicaron. En `suma` cada uno
 * descuenta su porcentaje del subtotal; en `cascada`, de lo que queda después de
 * los anteriores. El total no pasa de `descuentoMaximoPorcentaje` del subtotal: el
 * código que lo rebasa aplica solo lo que falta para el tope (y los siguientes, 0).
 */
export function calcularDescuentos(
  subtotal: number,
  porcentajes: number[],
  { modoCombinacion, descuentoMaximoPorcentaje }: ConfiguracionTienda["promociones"],
): number[] {
  const base = centavos(subtotal);
  const tope = Math.round((base * descuentoMaximoPorcentaje) / 100);
  let acumulado = 0;
  return porcentajes.map((porcentaje) => {
    const sobre = modoCombinacion === "suma" ? base : base - acumulado;
    const descuento = Math.min(Math.round((sobre * porcentaje) / 100), tope - acumulado);
    acumulado += descuento;
    return pesos(descuento);
  });
}
