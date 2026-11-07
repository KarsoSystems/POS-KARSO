import { vencerCorreccionesDelUsuario, vencerCorreccionesVencidas } from "./correccion";
import { vencerPagosDelUsuario, vencerPagosVencidos } from "./pago";

// Vencimientos que se revisan al leer (no hay procesos en segundo plano en el
// demo): el pago (SPEC 07) y la corrección de un pedido rechazado (SPEC 09).

/** Cancela los pedidos del usuario con el pago o la corrección vencidos. Antes de responder lista, detalle o folio. */
export async function vencerPedidosDelUsuario(userId: string, ahora: Date = new Date()): Promise<void> {
  await vencerPagosDelUsuario(userId, ahora);
  await vencerCorreccionesDelUsuario(userId, ahora);
}

/** Lo mismo para todos los usuarios (la lista del panel). */
export async function vencerPedidosVencidos(ahora: Date = new Date()): Promise<void> {
  await vencerPagosVencidos(ahora);
  await vencerCorreccionesVencidas(ahora);
}
