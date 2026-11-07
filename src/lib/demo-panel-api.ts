import { apiFetch } from "@/lib/api-client";
// Solo tipos: se borran al compilar, no arrastran código del servidor al front.
import type { Pedido } from "@/server/domain/pedido";

/** Pedido como lo ve el panel: con el nombre de su cliente. */
export interface PedidoPanel extends Pedido {
  cliente: string;
}

// Simulador del panel de KARSO (SPEC 08): solo existe con DEMO_PANEL=1. Hace lo que
// harán los endpoints del panel en el backend; la tienda nunca lo usa.
export const demoPanelApi = {
  pedidos: () => apiFetch<{ pedidos: PedidoPanel[] }>("/api/demo-panel/pedidos"),

  validar: (id: string) =>
    apiFetch<{ pedido: Pedido }>(`/api/demo-panel/pedidos/${encodeURIComponent(id)}/validar`, { method: "POST" }),

  moverLinea: (id: string, lineaId: string, estatus: "en_proceso" | "listo") =>
    apiFetch<{ pedido: Pedido }>(
      `/api/demo-panel/pedidos/${encodeURIComponent(id)}/lineas/${encodeURIComponent(lineaId)}`,
      { method: "POST", body: { estatus } },
    ),

  entregar: (id: string) =>
    apiFetch<{ pedido: Pedido }>(`/api/demo-panel/pedidos/${encodeURIComponent(id)}/entregar`, { method: "POST" }),
};
