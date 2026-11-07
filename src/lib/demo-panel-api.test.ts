import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoPanelApi } from "./demo-panel-api";

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

describe("demoPanelApi", () => {
  it.each([
    ["pedidos", () => demoPanelApi.pedidos(), "GET", "/api/demo-panel/pedidos"],
    ["validar", () => demoPanelApi.validar("p1"), "POST", "/api/demo-panel/pedidos/p1/validar"],
    ["moverLinea", () => demoPanelApi.moverLinea("p1", "l/1", "listo"), "POST", "/api/demo-panel/pedidos/p1/lineas/l%2F1"],
    ["entregar", () => demoPanelApi.entregar("p1"), "POST", "/api/demo-panel/pedidos/p1/entregar"],
    ["rechazar", () => demoPanelApi.rechazar("p1", []), "POST", "/api/demo-panel/pedidos/p1/rechazar"],
  ])("%s → %s %s", async (_, llamar, method, ruta) => {
    await llamar();
    expect(fetchMock).toHaveBeenCalledWith(ruta, expect.objectContaining({ method }));
  });

  it("moverLinea manda el estatus como JSON", async () => {
    await demoPanelApi.moverLinea("p1", "l1", "en_proceso");
    expect(fetchMock.mock.calls[0][1].body).toBe('{"estatus":"en_proceso"}');
  });

  it("rechazar manda las líneas con su motivo y comentario como JSON", async () => {
    await demoPanelApi.rechazar("p1", [{ lineaId: "l1", motivo: "color_rgb", comentario: "Pásalo a CMYK" }]);
    expect(fetchMock.mock.calls[0][1].body).toBe('{"lineas":[{"lineaId":"l1","motivo":"color_rgb","comentario":"Pásalo a CMYK"}]}');
  });
});
