import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-client";
import { pedidosApi, subirArchivo, urlArchivo } from "./pedidos-api";

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** XMLHttpRequest mínimo: guarda la última instancia para simular eventos desde el test. */
class FakeXhr {
  static ultima: FakeXhr;
  method = "";
  url = "";
  withCredentials = false;
  responseType = "";
  status = 0;
  responseText = "";
  enviado: unknown = null;
  abortado = false;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.ultima = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: unknown) {
    this.enviado = body;
  }
  abort() {
    this.abortado = true;
    this.onabort?.();
  }
  responder(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.onload?.();
  }
}

const archivo = (nombre: string, bytes = 10) => {
  const file = new File(["x"], nombre);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pedidosApi", () => {
  const item = {} as never;

  it.each([
    ["catalogo", () => pedidosApi.catalogo(), "GET", "/api/catalogo"],
    ["borrador", () => pedidosApi.borrador(), "GET", "/api/pedidos/borrador"],
    ["agregarItem", () => pedidosApi.agregarItem(item), "POST", "/api/pedidos/borrador/items"],
    ["editarItem", () => pedidosApi.editarItem("i1", item), "PUT", "/api/pedidos/borrador/items/i1"],
    ["quitarItem", () => pedidosApi.quitarItem("i1"), "DELETE", "/api/pedidos/borrador/items/i1"],
    ["confirmar", () => pedidosApi.confirmar(), "POST", "/api/pedidos/borrador/confirmar"],
    ["listar", () => pedidosApi.listar(), "GET", "/api/pedidos"],
    ["detalle", () => pedidosApi.detalle("p1"), "GET", "/api/pedidos/p1"],
    ["cancelar", () => pedidosApi.cancelar("p1"), "POST", "/api/pedidos/p1/cancelar"],
  ])("%s → %s %s", async (_, call, method, path) => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await call();
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method }));
  });

  it("agregarItem manda el ítem como JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    await pedidosApi.agregarItem({ cantidad: 10 } as never);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { "content-type": "application/json" },
      body: '{"cantidad":10}',
    });
  });

  it("los ids van codificados en la URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await pedidosApi.detalle("a/b");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pedidos/a%2Fb");
  });

  it("un 422 PEDIDO_VACIO llega como ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { error: { code: "PEDIDO_VACIO", message: "No has agregado nada a tu pedido" } }),
    );
    await expect(pedidosApi.confirmar()).rejects.toMatchObject({ status: 422, code: "PEDIDO_VACIO" });
  });
});

describe("urlArchivo", () => {
  it("usa la URL base de la API", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.ejemplo.com");
    expect(urlArchivo("abc")).toBe("https://api.ejemplo.com/api/archivos/abc");
  });
});

describe("subirArchivo", () => {
  it("envía FormData con el campo 'archivo', con cookies, y resuelve con el archivo", async () => {
    const file = archivo("perro.jpg");
    const promesa = subirArchivo(file);
    const xhr = FakeXhr.ultima;
    expect(xhr).toMatchObject({ method: "POST", url: "/api/archivos", withCredentials: true });
    expect((xhr.enviado as FormData).get("archivo")).toBeInstanceOf(File);

    xhr.responder(201, { archivo: { id: "a1", nombreOriginal: "perro.jpg" } });
    await expect(promesa).resolves.toEqual({ archivo: { id: "a1", nombreOriginal: "perro.jpg" } });
  });

  it("reporta el avance de subida y termina en 1", async () => {
    const avances: number[] = [];
    const promesa = subirArchivo(archivo("a.png"), { onProgress: (a) => avances.push(a) });
    const xhr = FakeXhr.ultima;
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress!({ lengthComputable: false, loaded: 0, total: 0 });
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.responder(201, { archivo: {} });
    await promesa;
    expect(avances).toEqual([0.25, 1, 1]);
  });

  it("un error de la API llega como ApiError con el mensaje del servidor", async () => {
    const promesa = subirArchivo(archivo("a.pdf"));
    FakeXhr.ultima.responder(413, { error: { code: "ARCHIVO_MUY_GRANDE", message: "El archivo supera 50 MB" } });
    await expect(promesa).rejects.toMatchObject({
      status: 413,
      code: "ARCHIVO_MUY_GRANDE",
      message: "El archivo supera 50 MB",
    });
  });

  it("una respuesta no JSON da un ApiError genérico", async () => {
    const promesa = subirArchivo(archivo("a.pdf"));
    FakeXhr.ultima.responder(502, "<html>Bad gateway</html>");
    await expect(promesa).rejects.toMatchObject({ status: 502, code: "DESCONOCIDO" });
  });

  it("un fallo de red da ApiError con status 0", async () => {
    const promesa = subirArchivo(archivo("a.pdf"));
    FakeXhr.ultima.onerror!();
    await expect(promesa).rejects.toMatchObject({ status: 0, code: "RED" });
  });

  it("se puede cancelar con un AbortSignal", async () => {
    const controller = new AbortController();
    const promesa = subirArchivo(archivo("a.psd"), { signal: controller.signal });
    controller.abort();
    expect(FakeXhr.ultima.abortado).toBe(true);
    await expect(promesa).rejects.toMatchObject({ code: "CANCELADO" });
  });

  it("rechaza sin subir una extensión no permitida", async () => {
    const xhrAntes = FakeXhr.ultima;
    const error = await subirArchivo(archivo("virus.exe")).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 415, message: "Formato no permitido" });
    expect(FakeXhr.ultima).toBe(xhrAntes);
  });

  it("rechaza sin subir un archivo de más de 50 MB", async () => {
    const xhrAntes = FakeXhr.ultima;
    await expect(subirArchivo(archivo("grande.jpg", 52_428_801))).rejects.toMatchObject({
      status: 413,
      message: "El archivo supera 50 MB",
    });
    expect(FakeXhr.ultima).toBe(xhrAntes);
  });
});
