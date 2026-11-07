import type { Pedido } from "@/server/domain/pedido";

// Avisos al cliente (KARSO 5.8: pedido confirmado, rechazado y listo). En el demo
// solo se escriben en la consola del servidor, como el código de WhatsApp. Con el
// backend, esta función desaparece: cada cambio de estatus emitirá su evento y un
// worker enviará el correo o el WhatsApp (ver la nota de la SPEC 08).

export type EventoPedido = "pedido.enviado" | "pedido.listo"; // "pedido.rechazado" llega en la SPEC 09

function mensaje(evento: EventoPedido, pedido: Pedido): string {
  switch (evento) {
    case "pedido.enviado":
      return `Tu pedido ${pedido.folio} está confirmado: recibimos tu pago y la sucursal revisará tus archivos`;
    case "pedido.listo":
      return `Tu pedido ${pedido.folio} está listo para recoger en ${pedido.sucursalEntrega?.nombre ?? "tu sucursal"}`;
  }
}

/** Avisa al cliente de un cambio de su pedido. Si falla, el cambio de estatus no se afecta. */
export function notificar(evento: EventoPedido, pedido: Pedido): void {
  try {
    console.info(`[DEMO CORREO] ${mensaje(evento, pedido)}`);
  } catch {
    // Nunca debe tumbar la operación que lo llamó.
  }
}
