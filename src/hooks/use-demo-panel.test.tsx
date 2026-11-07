// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearQueryClient } from "@/app/providers";
import { queryKeys } from "./query-keys";
import { useAccionPanel, useMotivosRechazo, usePedidosPanel } from "./use-demo-panel";
import { usePedidoPorFolio } from "./use-pedidos";

const fetchMock = vi.fn();
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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

describe("usePedidosPanel y useAccionPanel", () => {
  it("lista los pedidos y, tras una acción, vuelve a pedir la lista e invalida los pedidos del cliente", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { pedidos: [{ id: "p1", cliente: "Ana López" }] }));
    const lista = renderHook(() => usePedidosPanel(), { wrapper });
    await waitFor(() => expect(lista.result.current.data).toEqual([{ id: "p1", cliente: "Ana López" }]));

    queryClient.setQueryData(queryKeys.pedido("p1"), { pedido: { id: "p1" } });
    fetchMock.mockResolvedValue(jsonResponse(200, { pedido: { id: "p1", estatus: "recibido" } }));
    const accion = renderHook(() => useAccionPanel(), { wrapper });
    await act(() => accion.result.current.mutateAsync({ tipo: "validar", id: "p1" }));

    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/demo-panel/pedidos/p1/validar");
    expect(queryClient.getQueryState(queryKeys.pedido("p1"))?.isInvalidated).toBe(true);
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/demo-panel/pedidos")).toHaveLength(2));
  });

  it("los motivos de rechazo salen de la misma respuesta que la lista; rechazar llama a su ruta", async () => {
    const motivos = [{ clave: "color_rgb", nombre: "El archivo está en RGB" }];
    fetchMock.mockResolvedValue(jsonResponse(200, { pedidos: [], motivosRechazo: motivos }));
    const lista = renderHook(() => usePedidosPanel(), { wrapper });
    const catalogo = renderHook(() => useMotivosRechazo(), { wrapper });
    await waitFor(() => expect(catalogo.result.current.data).toEqual(motivos));
    expect(lista.result.current.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(jsonResponse(200, { pedido: { id: "p1", estatus: "rechazado" } }));
    const accion = renderHook(() => useAccionPanel(), { wrapper });
    const lineas = [{ lineaId: "l1", motivo: "color_rgb", comentario: "Pásalo a CMYK" }];
    await act(() => accion.result.current.mutateAsync({ tipo: "rechazar", id: "p1", lineas }));
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/demo-panel/pedidos/p1/rechazar");
  });

  it("sin DEMO_PANEL la lista llega como error 404, sin reintentos", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { code: "NO_ENCONTRADO", message: "No encontrado" } }));
    const { result } = renderHook(() => usePedidosPanel(), { wrapper });
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 404 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("usePedidoPorFolio", () => {
  it("pide el pedido por folio; un 404 no se reintenta", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { code: "NO_ENCONTRADO", message: "Pedido no encontrado" } }));
    const { result } = renderHook(() => usePedidoPorFolio("KAR-2026-000001"), { wrapper });
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 404, message: "Pedido no encontrado" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pedidos/folio/KAR-2026-000001");
  });
});
