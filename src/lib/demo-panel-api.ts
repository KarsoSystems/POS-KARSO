import { apiFetch } from "@/lib/api-client";
import type { MotivoRechazo } from "@/lib/configuracion/schema";
import type { RechazoInput } from "@/lib/validation/panel-demo";
// Solo tipos: se borran al compilar, no arrastran código del servidor al front.
import type { Pedido } from "@/server/domain/pedido";

/** Pedido como lo ve el panel: con el nombre de su cliente. */
export interface PedidoPanel extends Pedido {
  cliente: string;
}

export type { MotivoRechazo, RechazoInput };

// Simulador del panel de KARSO (SPEC 08): solo existe con DEMO_PANEL=1. Hace lo que
// harán los endpoints del panel en el backend; la tienda nunca lo usa.
export const demoPanelApi = {
  /** Los pedidos y el catálogo de motivos de rechazo (SPEC 09), para el formulario. */
  pedidos: () => apiFetch<{ pedidos: PedidoPanel[]; motivosRechazo: MotivoRechazo[] }>("/api/demo-panel/pedidos"),

  validar: (id: string) =>
    apiFetch<{ pedido: Pedido }>(`/api/demo-panel/pedidos/${encodeURIComponent(id)}/validar`, { method: "POST" }),

  moverLinea: (id: string, lineaId: string, estatus: "en_proceso" | "listo") =>
    apiFetch<{ pedido: Pedido }>(
      `/api/demo-panel/pedidos/${encodeURIComponent(id)}/lineas/${encodeURIComponent(lineaId)}`,
      { method: "POST", body: { estatus } },
    ),

  /** Mostrador rechaza el pedido `enviado` con un motivo por línea (SPEC 09). */
  rechazar: (id: string, lineas: RechazoInput["lineas"]) =>
    apiFetch<{ pedido: Pedido }>(`/api/demo-panel/pedidos/${encodeURIComponent(id)}/rechazar`, {
      method: "POST",
      body: { lineas },
    }),

  entregar: (id: string) =>
    apiFetch<{ pedido: Pedido }>(`/api/demo-panel/pedidos/${encodeURIComponent(id)}/entregar`, { method: "POST" }),
};
