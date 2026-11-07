import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perfilApi } from "./perfil-api";

const fetchMock = vi.fn();
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("perfilApi", () => {
  it.each([
    ["guardarDireccion", () => perfilApi.guardarDireccion({ tipo: "ocasional", nombreNegocio: null, direccion: null }), "PUT", "/api/perfil/direccion"],
    ["guardarDatosFiscales", () => perfilApi.guardarDatosFiscales({} as never), "PUT", "/api/perfil/datos-fiscales"],
    ["borrarDatosFiscales", () => perfilApi.borrarDatosFiscales(), "DELETE", "/api/perfil/datos-fiscales"],
    ["cambiarContrasena", () => perfilApi.cambiarContrasena({ password: "a", confirmacion: "a" }), "PUT", "/api/perfil/contrasena"],
    ["telefonoEnCurso", () => perfilApi.telefonoEnCurso(), "GET", "/api/perfil/telefono"],
    ["pedirCambioTelefono", () => perfilApi.pedirCambioTelefono({ whatsapp: "8187654321" }), "POST", "/api/perfil/telefono"],
    ["verificarTelefono", () => perfilApi.verificarTelefono("123456"), "POST", "/api/perfil/telefono/verificar"],
    ["reenviarCodigoTelefono", () => perfilApi.reenviarCodigoTelefono(), "POST", "/api/perfil/telefono/reenviar"],
    ["cancelarCambioTelefono", () => perfilApi.cancelarCambioTelefono(), "DELETE", "/api/perfil/telefono"],
  ])("%s → %s %s", async (_, llamar, method, ruta) => {
    await llamar();
    expect(fetchMock).toHaveBeenCalledWith(ruta, expect.objectContaining({ method }));
  });

  it("los datos fiscales van dentro de { datosFiscales } y el código dentro de { codigo }", async () => {
    await perfilApi.guardarDatosFiscales({ rfc: "PELJ800101ABC" } as never);
    await perfilApi.verificarTelefono("123456");
    expect(fetchMock.mock.calls[0][1].body).toBe('{"datosFiscales":{"rfc":"PELJ800101ABC"}}');
    expect(fetchMock.mock.calls[1][1].body).toBe('{"codigo":"123456"}');
  });
});
