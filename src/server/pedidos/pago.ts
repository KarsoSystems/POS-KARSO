import { randomInt } from "node:crypto";
import { resumenPagos, venceElPago } from "@/lib/pedidos/pago";
import type { ResultadoPago } from "@/lib/validation/checkout";
import type { Pedido } from "@/server/domain/pedido";
import { EstatusPedidoInvalidoError, pedidoRepository, userRepository } from "@/server/repositories";

// Pago en línea con Mercado Pago emulado (SPEC 07; KARSO 5.6 y 5.8). La página de
// pago simulada llama a `registrarPagoSimulado`, que hace lo que hará el webhook
// real. El vencimiento se revisa al leer: un pedido sin pagar a tiempo se cancela
// la primera vez que alguien lo lee (y nadie puede pagarlo después).

export class PagoVencidoError extends Error {
  constructor() {
    super("El plazo para pagar este pedido venció");
    this.name = "PagoVencidoError";
  }
}

/** "Pago no recibido en 24 h", con el plazo que tuvo el pedido (no el de la configuración de hoy). */
function motivoVencimiento(pedido: Pedido): string {
  const horas = Math.round((Date.parse(pedido.vencimientoPago!) - Date.parse(pedido.confirmadoAt!)) / 3_600_000);
  return `Pago no recibido en ${horas} h`;
}

/** Cancela el pedido por vencimiento (en el lock de `pedidoRepository.update`). */
function cancelarPorVencimiento(pedido: Pedido): void {
  const fecha = pedido.vencimientoPago!;
  const motivo = motivoVencimiento(pedido);
  pedido.estatus = "cancelado";
  pedido.cancelacion = { fecha, por: "sistema", motivo, reembolso: null };
  pedido.historialEstatus.push({ estatus: "cancelado", fecha, por: "sistema", comentario: motivo });
}

/**
 * Cancela los pedidos del usuario cuyo pago venció y libera sus códigos de
 * promoción. Se llama antes de responder la lista, el detalle o un pago.
 */
export async function vencerPagosDelUsuario(userId: string, ahora: Date = new Date()): Promise<void> {
  const vencidos = (await pedidoRepository.listByUser(userId)).filter((p) => venceElPago(p, ahora));
  for (const { id } of vencidos) {
    let cancelado = false;
    await pedidoRepository.update(id, (pedido) => {
      // Se revisa otra vez bajo el lock: pudo pagarse entre leer y cancelar.
      if (!venceElPago(pedido, ahora)) return;
      cancelarPorVencimiento(pedido);
      cancelado = true;
    });
    if (cancelado) await userRepository.liberarUsosPromociones(userId, id);
  }
}

/** Referencia de 10 dígitos, como el id de pago de Mercado Pago. */
const referenciaSimulada = () => String(randomInt(1_000_000_000, 10_000_000_000));

/**
 * Registra el resultado del pago (lo que en producción llegará por el webhook de
 * Mercado Pago). Aprobado: el pedido pasa a `enviado`. Rechazado o pendiente: sigue
 * en `pago_pendiente` y se puede reintentar. Lanza PagoVencidoError si ya venció
 * (y lo cancela si nadie lo había leído), o EstatusPedidoInvalidoError si no está en
 * `pago_pendiente` por otra razón.
 * El pedido ya debe ser del usuario (lo revisa la ruta).
 */
export async function registrarPagoSimulado(
  pedidoId: string,
  resultado: ResultadoPago,
  ahora: Date = new Date(),
): Promise<Pedido> {
  let vencido = false;
  let yaCancelado = false;
  const pedido = await pedidoRepository.update(pedidoId, (p) => {
    if (venceElPago(p, ahora)) {
      cancelarPorVencimiento(p);
      vencido = true;
      return;
    }
    // Ya lo canceló el vencimiento (al leerlo): para el cliente es el mismo caso.
    if (p.estatus === "cancelado" && p.cancelacion?.por === "sistema" && p.vencimientoPago) {
      yaCancelado = true;
      return;
    }
    if (p.estatus !== "pago_pendiente") throw new EstatusPedidoInvalidoError(p.id, p.estatus);

    const fecha = ahora.toISOString();
    p.pagos.push({
      tipo: "total",
      metodo: "mercadopago",
      monto: p.total,
      referencia: referenciaSimulada(),
      estatus: resultado,
      fecha,
      recibidoPor: null,
    });
    Object.assign(p, resumenPagos(p.pagos, p.total));
    if (resultado === "aprobado") {
      p.estatus = "enviado";
      p.historialEstatus.push({ estatus: "enviado", fecha, por: "sistema", comentario: "Pago aprobado por Mercado Pago" });
    }
  });
  if (vencido) await userRepository.liberarUsosPromociones(pedido.userId, pedido.id);
  if (vencido || yaCancelado) throw new PagoVencidoError();
  return pedido;
}
