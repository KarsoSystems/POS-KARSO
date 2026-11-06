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
  const URL_FIRMADA = "http://localhost:3000/api/r2-local/temporal/a1.jpg?expira=1&bytes=10&firma=f";
  const pendiente = { id: "a1", nombreOriginal: "perro.jpg", estado: "pendiente" };
  const subido = { id: "a1", nombreOriginal: "perro.jpg", estado: "subido", miniatura: true };
  const subida = { archivo: pendiente, subida: { url: URL_FIRMADA, metodo: "PUT", expiraEn: "2026-11-05T12:15:00Z" } };

  /** Espera a que el cliente abra el XMLHttpRequest del PUT (después de pedir la URL). */
  async function xhrDelPut(antes: FakeXhr | undefined): Promise<FakeXhr> {
    await vi.waitFor(() => expect(FakeXhr.ultima).not.toBe(antes));
    return FakeXhr.ultima;
  }

  it("pide la URL firmada, sube con PUT sin cookies y confirma", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, subida)).mockResolvedValueOnce(jsonResponse(200, { archivo: subido }));
    const file = archivo("perro.jpg", 10);
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(file);

    const xhr = await xhrDelPut(antes);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/archivos/subidas", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ nombre: "perro.jpg", bytes: 10 }),
    }));
    expect(xhr).toMatchObject({ method: "PUT", url: URL_FIRMADA, withCredentials: false });
    expect(xhr.enviado).toBe(file);

    xhr.responder(200, "");
    await expect(promesa).resolves.toEqual({ archivo: subido });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/archivos/a1/confirmar", expect.objectContaining({ method: "POST" }));
  });

  it("reporta el avance del PUT y termina en 1 al confirmar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, subida)).mockResolvedValueOnce(jsonResponse(200, { archivo: subido }));
    const avances: number[] = [];
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.tiff"), { onProgress: (a) => avances.push(a) });
    const xhr = await xhrDelPut(antes);
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress!({ lengthComputable: false, loaded: 0, total: 0 });
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.responder(200, "");
    await promesa;
    expect(avances).toEqual([0.25, 1, 1]);
  });

  it("un error al pedir la URL llega como ApiError y no sube nada", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(413, { error: { code: "ARCHIVO_MUY_GRANDE", message: "El archivo supera 40 MB" } }),
    );
    const antes = FakeXhr.ultima;
    await expect(subirArchivo(archivo("a.pdf"))).rejects.toMatchObject({
      status: 413,
      code: "ARCHIVO_MUY_GRANDE",
      message: "El archivo supera 40 MB",
    });
    expect(FakeXhr.ultima).toBe(antes);
  });

  it("un 403 del PUT (URL vencida) llega como ApiError y no confirma", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, subida));
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.pdf"));
    (await xhrDelPut(antes)).responder(403, {
      error: { code: "FIRMA_INVALIDA", message: "La URL de subida no es válida o ya venció" },
    });
    await expect(promesa).rejects.toMatchObject({ status: 403, code: "FIRMA_INVALIDA" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un PUT con respuesta no JSON (como el XML de R2) da un ApiError genérico", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, subida));
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.pdf"));
    (await xhrDelPut(antes)).responder(502, "<Error>Bad gateway</Error>");
    await expect(promesa).rejects.toMatchObject({ status: 502, code: "DESCONOCIDO" });
  });

  it("un fallo de red en el PUT da ApiError con status 0", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, subida));
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.pdf"));
    (await xhrDelPut(antes)).onerror!();
    await expect(promesa).rejects.toMatchObject({ status: 0, code: "RED" });
  });

  it("un error al confirmar (409) llega como ApiError", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, subida))
      .mockResolvedValueOnce(jsonResponse(409, { error: { code: "ARCHIVO_NO_SUBIDO", message: "El archivo no llegó; vuelve a subirlo" } }));
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.pdf"));
    (await xhrDelPut(antes)).responder(200, "");
    await expect(promesa).rejects.toMatchObject({ status: 409, message: "El archivo no llegó; vuelve a subirlo" });
  });

  it("se puede cancelar durante el PUT", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, subida));
    const controller = new AbortController();
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.eps"), { signal: controller.signal });
    const xhr = await xhrDelPut(antes);
    controller.abort();
    expect(xhr.abortado).toBe(true);
    await expect(promesa).rejects.toMatchObject({ code: "CANCELADO", message: "Subida cancelada" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("se puede cancelar mientras pide la URL", async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("", "AbortError")))),
    );
    const controller = new AbortController();
    const antes = FakeXhr.ultima;
    const promesa = subirArchivo(archivo("a.pdf"), { signal: controller.signal });
    controller.abort();
    await expect(promesa).rejects.toMatchObject({ code: "CANCELADO", message: "Subida cancelada" });
    expect(FakeXhr.ultima).toBe(antes);
  });

  it("rechaza sin pedir URL una extensión no permitida (PNG incluido)", async () => {
    for (const nombre of ["virus.exe", "logo.png", "capas.psd"]) {
      const error = await subirArchivo(archivo(nombre)).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 415, message: "Formato no permitido" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza sin pedir URL un archivo de más de 40 MB", async () => {
    await expect(subirArchivo(archivo("grande.jpg", 41_943_041))).rejects.toMatchObject({
      status: 413,
      message: "El archivo supera 40 MB",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
