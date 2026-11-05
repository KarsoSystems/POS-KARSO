// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearQueryClient } from "@/app/providers";
import { ApiError } from "@/lib/api-client";
import { queryKeys } from "./query-keys";
import { useBanners } from "./use-banners";
import { useProductos } from "./use-productos";

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

describe("useProductos", () => {
  it("pide /api/tienda/productos y devuelve { ejemplo, productos }", async () => {
    const datos = { ejemplo: true, productos: [{ _id: "p1", nombre: "Tarjeta" }] };
    fetchMock.mockResolvedValue(jsonResponse(200, datos));
    const { result } = renderHook(() => useProductos(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(datos));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tienda/productos");
    expect(queryClient.getQueryData(queryKeys.productos)).toEqual(datos);
  });

  it("un 500 llega como ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { error: { code: "CATALOGO_INVALIDO", message: "El catálogo no está disponible" } }),
    );
    const { result } = renderHook(() => useProductos(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 500, code: "CATALOGO_INVALIDO" });
  });
});

describe("useBanners", () => {
  it("pide /api/tienda/banners y devuelve la lista", async () => {
    const banners = [{ _id: "b1", titulo: "Tarjetas" }];
    fetchMock.mockResolvedValue(jsonResponse(200, { banners }));
    const { result } = renderHook(() => useBanners(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(banners));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tienda/banners");
  });
});
