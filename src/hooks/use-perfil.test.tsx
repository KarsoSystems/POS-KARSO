// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearQueryClient } from "@/app/providers";
import { queryKeys } from "./query-keys";
import {
  useBorrarDatosFiscales,
  useCambiarContrasena,
  useCerrarOtrasSesiones,
  useGuardarDireccion,
  usePedirCambioTelefono,
  useTelefonoEnCurso,
  useVerificarTelefono,
} from "./use-perfil";

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

describe("tarjetas del perfil", () => {
  it("guardar la dirección y borrar los datos fiscales escriben el usuario en la caché de la sesión", async () => {
    queryClient.setQueryData(queryKeys.sesion, { user: { id: "u1", tipo: "ocasional" } });
    fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: "u1", tipo: "socio" } }));
    const direccion = renderHook(() => useGuardarDireccion(), { wrapper });
    await act(() => direccion.result.current.mutateAsync({ tipo: "socio", nombreNegocio: "X", direccion: null }));
    expect(queryClient.getQueryData(queryKeys.sesion)).toEqual({ user: { id: "u1", tipo: "socio" } });

    fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: "u1", datosFiscales: null } }));
    const borrar = renderHook(() => useBorrarDatosFiscales(), { wrapper });
    await act(() => borrar.result.current.mutateAsync(undefined));
    expect(queryClient.getQueryData(queryKeys.sesion)).toEqual({ user: { id: "u1", datosFiscales: null } });
  });
});

describe("sesiones (SPEC 11)", () => {
  it("cambiar la contraseña guarda el usuario en la caché y entrega cuántas sesiones cerró", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: "u1", providers: ["google", "password"] }, sesionesCerradas: 2 }));
    const cambiar = renderHook(() => useCambiarContrasena(), { wrapper });
    const respuesta = await act(() =>
      cambiar.result.current.mutateAsync({ contrasenaActual: "actual123", password: "nueva1234", confirmacion: "nueva1234" }),
    );
    expect(respuesta.sesionesCerradas).toBe(2);
    expect(queryClient.getQueryData(queryKeys.sesion)).toEqual({ user: { id: "u1", providers: ["google", "password"] } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ contrasenaActual: "actual123" });
  });

  it("cerrar las demás sesiones hace DELETE /api/perfil/sesiones y entrega cuántas cerró", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cerradas: 3 }));
    const cerrar = renderHook(() => useCerrarOtrasSesiones(), { wrapper });
    expect(await act(() => cerrar.result.current.mutateAsync())).toEqual({ cerradas: 3 });
    expect(fetchMock).toHaveBeenCalledWith("/api/perfil/sesiones", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("cambio de teléfono", () => {
  it("pedir el cambio vuelve a leer el cambio en curso; verificar guarda el usuario", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { whatsappNuevo: null }));
    const enCurso = renderHook(() => useTelefonoEnCurso(), { wrapper });
    await waitFor(() => expect(enCurso.result.current.data).toBeNull());

    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/perfil/telefono" && fetchMock.mock.calls.length === 2
        ? jsonResponse(200, { whatsappNuevo: "+528187654321", reenviarEn: 60, demoCodigo: "123456" })
        : jsonResponse(200, { whatsappNuevo: "+528187654321" }),
    );
    const pedir = renderHook(() => usePedirCambioTelefono(), { wrapper });
    const respuesta = await act(() => pedir.result.current.mutateAsync({ whatsapp: "8187654321" }));
    expect(respuesta.demoCodigo).toBe("123456");
    await waitFor(() => expect(enCurso.result.current.data).toBe("+528187654321"));

    fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: "u1", whatsapp: "+528187654321" } }));
    const verificar = renderHook(() => useVerificarTelefono(), { wrapper });
    await act(() => verificar.result.current.mutateAsync("123456"));
    expect(queryClient.getQueryData(queryKeys.sesion)).toEqual({ user: { id: "u1", whatsapp: "+528187654321" } });
    expect(fetchMock.mock.calls.some((c) => c[0] === "/api/perfil/telefono/verificar")).toBe(true);
  });

  it("un código agotado (410) también vuelve a leer el cambio en curso", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { whatsappNuevo: "+528187654321" }));
    const enCurso = renderHook(() => useTelefonoEnCurso(), { wrapper });
    await waitFor(() => expect(enCurso.result.current.data).toBe("+528187654321"));

    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/perfil/telefono/verificar"
        ? jsonResponse(410, { error: { code: "CODIGO_AGOTADO", message: "Demasiados intentos. Solicita un código nuevo." } })
        : jsonResponse(200, { whatsappNuevo: null }),
    );
    const verificar = renderHook(() => useVerificarTelefono(), { wrapper });
    await act(() => verificar.result.current.mutateAsync("000000").catch(() => {}));
    await waitFor(() => expect(enCurso.result.current.data).toBeNull());
  });
});
