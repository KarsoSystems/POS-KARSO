"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LineaInput } from "@/lib/validation/pedidos";
import { pedidosApi, type PedidoResponse } from "@/lib/pedidos-api";
import { queryKeys } from "./query-keys";

/** Borrador del usuario (el servidor lo crea si no hay), con los archivos de sus líneas. */
export function useBorrador({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.borrador, queryFn: pedidosApi.borrador, enabled });
}

/** Pedidos confirmados del usuario, recientes primero. */
export function usePedidos() {
  return useQuery({
    queryKey: queryKeys.pedidos,
    queryFn: pedidosApi.listar,
    select: (data) => data.pedidos,
  });
}

export function usePedido(id: string) {
  return useQuery({ queryKey: queryKeys.pedido(id), queryFn: () => pedidosApi.detalle(id) });
}

/** Las mutaciones del borrador responden con el borrador recalculado: se escribe en la caché sin volver a pedirlo. */
function useMutacionBorrador<V>(mutationFn: (variables: V) => Promise<PedidoResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (datos) => queryClient.setQueryData(queryKeys.borrador, datos),
  });
}

export function useAgregarItem() {
  return useMutacionBorrador((input: LineaInput) => pedidosApi.agregarItem(input));
}

export function useEditarItem() {
  return useMutacionBorrador(({ lineaId, input }: { lineaId: string; input: LineaInput }) =>
    pedidosApi.editarItem(lineaId, input),
  );
}

export function useQuitarItem() {
  return useMutacionBorrador((lineaId: string) => pedidosApi.quitarItem(lineaId));
}

export function useConfirmarPedido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pedidosApi.confirmar,
    onSuccess: (datos) => {
      queryClient.setQueryData(queryKeys.pedido(datos.pedido.id), datos);
      // Sin recargar ahora: la pantalla del borrador se va al detalle y no debe parpadear vacía.
      queryClient.invalidateQueries({ queryKey: queryKeys.borrador, refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: queryKeys.pedidos });
    },
  });
}

export function useCancelarPedido(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pedidosApi.cancelar(id),
    onSuccess: (datos) => {
      queryClient.setQueryData(queryKeys.pedido(id), datos);
      queryClient.invalidateQueries({ queryKey: queryKeys.pedidos });
    },
  });
}
