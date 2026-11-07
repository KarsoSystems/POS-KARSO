// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearQueryClient } from "@/app/providers";
import { ApiError } from "@/lib/api-client";
import type { PedidoResponse } from "@/lib/pedidos-api";
import { queryKeys } from "./query-keys";
import {
  useAgregarItem,
  useAplicarCodigo,
  useCambiarCheckout,
  useConfirmarPedido,
  useCorregirArchivos,
  useEnviarCorreccion,
  usePagarSimulado,
  usePedidos,
  useQuitarCodigo,
} from "./use-pedidos";

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const respuesta = (id: string, estado = "borrador") =>
  ({ pedido: { id, estado, productos: [] }, archivos: {} }) as unknown as PedidoResponse;

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

describe("checkout del borrador (SPEC 06)", () => {
  it.each([
    ["useCambiarCheckout", () => useCambiarCheckout(), { sucursalEntregaId: "s1" }, "/api/pedidos/borrador", "PATCH"],
    ["useAplicarCodigo", () => useAplicarCodigo(), "KARSO10", "/api/pedidos/borrador/promociones", "POST"],
    ["useQuitarCodigo", () => useQuitarCodigo(), "KARSO10", "/api/pedidos/borrador/promociones/KARSO10", "DELETE"],
  ] as const)("%s escribe el borrador de la respuesta en la caché sin otra petición", async (_, hook, variables, ruta, method) => {
    const nuevo = respuesta("b1");
    fetchMock.mockResolvedValue(jsonResponse(200, nuevo));
    // Cada hook tiene sus propias variables: en la tabla se tratan igual.
    const { result } = renderHook(hook as () => { mutateAsync: (v: unknown) => Promise<unknown> }, { wrapper });

    await act(() => result.current.mutateAsync(variables));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ruta);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method });
    expect(queryClient.getQueryData(queryKeys.borrador)).toEqual(nuevo);
  });

  it("un código inválido llega como ApiError con el mensaje del campo y no toca la caché", async () => {
    queryClient.setQueryData(queryKeys.borrador, respuesta("b1"));
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: { code: "VALIDACION", message: "Este código venció", fields: { codigo: "Este código venció" } },
      }),
    );
    const { result } = renderHook(() => useAplicarCodigo(), { wrapper });

    await act(() => result.current.mutateAsync("VERANO15").catch(() => {}));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect((result.current.error as ApiError).fields).toEqual({ codigo: "Este código venció" });
    expect(queryClient.getQueryData(queryKeys.borrador)).toEqual(respuesta("b1"));
  });
});

describe("usePagarSimulado", () => {
  it("guarda el pedido de la respuesta en su detalle e invalida la lista", async () => {
    const pagado = respuesta("p1", "enviado");
    fetchMock.mockResolvedValue(jsonResponse(200, pagado));
    queryClient.setQueryData(queryKeys.pedidos, { pedidos: [] });
    const { result } = renderHook(() => usePagarSimulado("p1"), { wrapper });

    await act(() => result.current.mutateAsync("aprobado"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pedidos/p1/pago-simulado");
    expect(queryClient.getQueryData(queryKeys.pedido("p1"))).toEqual(pagado);
    expect(queryClient.getQueryState(queryKeys.pedidos)?.isInvalidated).toBe(true);
  });

  it("un 409 PAGO_VENCIDO llega como ApiError e invalida el detalle", async () => {
    queryClient.setQueryData(queryKeys.pedido("p1"), respuesta("p1", "pago_pendiente"));
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { code: "PAGO_VENCIDO", message: "El plazo para pagar este pedido venció" } }),
    );
    const { result } = renderHook(() => usePagarSimulado("p1"), { wrapper });

    await act(() => result.current.mutateAsync("aprobado").catch(() => {}));
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 409, code: "PAGO_VENCIDO" }));
    expect(queryClient.getQueryState(queryKeys.pedido("p1"))?.isInvalidated).toBe(true);
  });
});

describe("useCorregirArchivos y useEnviarCorreccion (SPEC 09)", () => {
  it("guardan el pedido de la respuesta en su detalle e invalidan la lista", async () => {
    const corregido = respuesta("p1", "rechazado");
    fetchMock.mockResolvedValue(jsonResponse(200, corregido));
    queryClient.setQueryData(queryKeys.pedidos, { pedidos: [] });
    const corregir = renderHook(() => useCorregirArchivos("p1"), { wrapper });

    await act(() => corregir.result.current.mutateAsync({ lineaId: "l1", frente: "a1" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pedidos/p1/lineas/l1/archivos");
    expect(fetchMock.mock.calls[0][1].body).toBe('{"frente":"a1"}');
    expect(queryClient.getQueryData(queryKeys.pedido("p1"))).toEqual(corregido);
    expect(queryClient.getQueryState(queryKeys.pedidos)?.isInvalidated).toBe(true);

    const enviado = respuesta("p1", "enviado");
    fetchMock.mockResolvedValue(jsonResponse(200, enviado));
    const enviar = renderHook(() => useEnviarCorreccion("p1"), { wrapper });
    await act(() => enviar.result.current.mutateAsync(undefined));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/pedidos/p1/correccion");
    expect(queryClient.getQueryData(queryKeys.pedido("p1"))).toEqual(enviado);
  });

  it("un 409 CORRECCION_VENCIDA invalida el detalle para mostrarlo cancelado", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { code: "CORRECCION_VENCIDA", message: "El plazo para corregir este pedido venció" } }),
    );
    queryClient.setQueryData(queryKeys.pedido("p1"), respuesta("p1", "rechazado"));
    const { result } = renderHook(() => useEnviarCorreccion("p1"), { wrapper });
    await act(() => result.current.mutateAsync(undefined).catch(() => {}));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(queryClient.getQueryState(queryKeys.pedido("p1"))?.isInvalidated).toBe(true);
  });
});
