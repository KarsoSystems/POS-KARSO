// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearQueryClient } from "@/app/providers";
import { ApiError } from "@/lib/api-client";
import type { PedidoResponse } from "@/lib/pedidos-api";
import { queryKeys } from "./query-keys";
import { useAgregarItem, useConfirmarPedido, usePedidos } from "./use-pedidos";

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const respuesta = (id: string, estado = "borrador") =>
  ({ pedido: { id, estado, items: [] }, archivos: {} }) as unknown as PedidoResponse;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  queryClient = crearQueryClient();
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("useAgregarItem", () => {
  it("escribe el borrador de la respuesta en la caché sin otra petición", async () => {
    const nuevo = respuesta("b1");
    fetchMock.mockResolvedValue(jsonResponse(200, nuevo));
    const { result } = renderHook(() => useAgregarItem(), { wrapper });

    await act(() => result.current.mutateAsync({} as never));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pedidos/borrador/items");
    expect(queryClient.getQueryData(queryKeys.borrador)).toEqual(nuevo);
  });

  it("un error de la API llega como ApiError en `error`", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { error: { code: "VALIDACION", message: "Revisa los campos", fields: { cantidad: "x" } } }),
    );
    const { result } = renderHook(() => useAgregarItem(), { wrapper });

    act(() => result.current.mutate({} as never));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 422, code: "VALIDACION", message: "Revisa los campos" });
    expect(queryClient.getQueryData(queryKeys.borrador)).toBeUndefined();
  });
});

describe("useConfirmarPedido", () => {
  it("invalida la lista de pedidos y guarda el detalle del confirmado", async () => {
    queryClient.setQueryData(queryKeys.pedidos, { pedidos: [] });
    queryClient.setQueryData(queryKeys.borrador, respuesta("b1"));
    const confirmado = respuesta("b1", "pedido");
    fetchMock.mockResolvedValue(jsonResponse(200, confirmado));
    const { result } = renderHook(() => useConfirmarPedido(), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryState(queryKeys.pedidos)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.borrador)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(queryKeys.pedido("b1"))).toEqual(confirmado);
    // Sin pantallas montadas, invalidar no dispara peticiones: solo la del confirmar.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("con Mis pedidos montado, la lista se vuelve a pedir tras confirmar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { pedidos: [] }));
    const lista = renderHook(() => usePedidos(), { wrapper });
    await waitFor(() => expect(lista.result.current.data).toEqual([]));

    const confirmado = respuesta("p1", "pedido");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, confirmado))
      .mockResolvedValueOnce(jsonResponse(200, { pedidos: [confirmado.pedido] }));
    const { result } = renderHook(() => useConfirmarPedido(), { wrapper });

    await act(() => result.current.mutateAsync());

    await waitFor(() => expect(lista.result.current.data).toEqual([confirmado.pedido]));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/pedidos",
      "/api/pedidos/borrador/confirmar",
      "/api/pedidos",
    ]);
  });
});
