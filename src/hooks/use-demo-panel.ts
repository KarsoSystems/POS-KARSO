"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { demoPanelApi } from "@/lib/demo-panel-api";
import { queryKeys } from "./query-keys";

// Simulador del panel (SPEC 08, solo con DEMO_PANEL=1). Cada acción vuelve a pedir
// la lista del panel y deja vieja la caché de los pedidos del cliente.

export function usePedidosPanel() {
  return useQuery({ queryKey: queryKeys.demoPanel, queryFn: demoPanelApi.pedidos, select: (d) => d.pedidos, retry: false });
}

type Accion =
  | { tipo: "validar"; id: string }
  | { tipo: "linea"; id: string; lineaId: string; estatus: "en_proceso" | "listo" }
  | { tipo: "entregar"; id: string };

export function useAccionPanel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accion: Accion) => {
      switch (accion.tipo) {
        case "validar":
          return demoPanelApi.validar(accion.id);
        case "linea":
          return demoPanelApi.moverLinea(accion.id, accion.lineaId, accion.estatus);
        case "entregar":
          return demoPanelApi.entregar(accion.id);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.demoPanel });
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
    },
  });
}
