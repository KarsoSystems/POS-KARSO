import type { MotivoRechazo } from "@/lib/configuracion/schema";
import { limiteCorreccion, rechazosVigentes } from "@/lib/pedidos/correccion";
import { formatearDiaDe } from "@/lib/pedidos/formato";
import type { Pedido } from "@/server/domain/pedido";

// Avisos al cliente (KARSO 5.8: pedido confirmado, rechazado y listo). En el demo
// solo se escriben en la consola del servidor, como el código de WhatsApp. Con el
// backend, esta función desaparece: cada cambio de estatus emitirá su evento y un
// worker enviará el correo o el WhatsApp (ver la nota de la SPEC 08).

export type EventoPedido = "pedido.enviado" | "pedido.rechazado" | "pedido.listo";

/** Lo que el aviso necesita además del pedido: los nombres de los motivos de rechazo. */
export interface ContextoAviso {
  motivosRechazo?: MotivoRechazo[];
}

/** "Tarjeta · Couché: Resolución insuficiente — El frente está a 150 dpi", por línea rechazada. */
export function textoRechazos(pedido: Pedido, motivos: MotivoRechazo[] = []): string {
  return rechazosVigentes(pedido)
    .map((r) => {
      const linea = pedido.productos.find((l) => l.lineaId === r.lineaId);
      const nombre = linea ? `${linea.nombre} · ${linea.variante}` : r.lineaId;
      const motivo = motivos.find((m) => m.clave === r.motivo)?.nombre ?? r.motivo;
      return `${nombre}: ${motivo} — ${r.comentario}`;
    })
    .join("; ");
}

function mensaje(evento: EventoPedido, pedido: Pedido, { motivosRechazo }: ContextoAviso): string {
  switch (evento) {
    case "pedido.enviado":
      return `Tu pedido ${pedido.folio} está confirmado: recibimos tu pago y la sucursal revisará tus archivos`;
    case "pedido.rechazado": {
      const limite = limiteCorreccion(pedido);
      const antes = limite ? ` Corrige antes del ${formatearDiaDe(limite)}.` : "";
      return `Tu pedido ${pedido.folio} fue rechazado: ${textoRechazos(pedido, motivosRechazo)}.${antes}`;
    }
    case "pedido.listo":
      return `Tu pedido ${pedido.folio} está listo para recoger en ${pedido.sucursalEntrega?.nombre ?? "tu sucursal"}`;
  }
}

/** Avisa al cliente de un cambio de su pedido. Si falla, el cambio de estatus no se afecta. */
export function notificar(evento: EventoPedido, pedido: Pedido, contexto: ContextoAviso = {}): void {
  try {
    console.info(`[DEMO CORREO] ${mensaje(evento, pedido, contexto)}`);
  } catch {
    // Nunca debe tumbar la operación que lo llamó.
  }
}
