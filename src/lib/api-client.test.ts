import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBaseUrl, apiFetch } from "./api-client";
import { authApi } from "./auth-api";

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiBaseUrl", () => {
  it("vacía = mismo origen", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(apiBaseUrl()).toBe("");
  });

  it("quita la barra final", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.ejemplo.com/");
    expect(apiBaseUrl()).toBe("https://api.ejemplo.com");
  });
});

describe("apiFetch", () => {
  it("antepone la URL base, envía cookies y serializa el body", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.ejemplo.com");
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    expect(await apiFetch("/api/x", { method: "POST", body: { a: 1 } })).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://api.ejemplo.com/api/x", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("GET sin body no manda content-type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch("/api/x");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", headers: undefined, body: undefined });
  });

  it("FormData se manda tal cual, sin content-type manual (el navegador pone el boundary)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const form = new FormData();
    form.append("archivo", new File(["x"], "a.jpg"));
    await apiFetch("/api/x", { method: "POST", body: form });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", headers: undefined });
    expect(fetchMock.mock.calls[0][1].body).toBe(form);
  });

  it("convierte { error } en ApiError tipado", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: { code: "CORREO_DUPLICADO", message: "Este correo ya está registrado", fields: { correo: "x" } },
      }),
    );
    const error = await apiFetch("/api/x").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CORREO_DUPLICADO",
      message: "Este correo ya está registrado",
      fields: { correo: "x" },
    });
  });

  it("expone Retry-After como retryAfter", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "REENVIO_PRONTO", message: "Espera" } }), {
        status: 429,
        headers: { "retry-after": "40" },
      }),
    );
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 429, retryAfter: 40 });
  });

  it("un error sin cuerpo JSON da un ApiError genérico", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 500,
      code: "DESCONOCIDO",
      message: "Ocurrió un error inesperado",
      fields: {},
    });
  });

  it("un fallo de red da ApiError con status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 0, code: "RED" });
  });

  it("pasa el signal a fetch y una cancelación da ApiError CANCELADO", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("", "AbortError"));
    });
    await expect(apiFetch("/api/x", { signal: controller.signal })).rejects.toMatchObject({ status: 0, code: "CANCELADO" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});

describe("apiFetch: renovación de la sesión (SPEC 11)", () => {
  const expirado = () => jsonResponse(401, { error: { code: "TOKEN_EXPIRADO", message: "Tu sesión necesita renovarse" } });
  const rutas = () => fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`);

  it("ante TOKEN_EXPIRADO renueva una vez y repite la petición con el mismo body", async () => {
    fetchMock
      .mockResolvedValueOnce(expirado())
      .mockResolvedValueOnce(jsonResponse(200, { user: {} }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    expect(await apiFetch("/api/x", { method: "PUT", body: { a: 1 } })).toEqual({ ok: true });
    expect(rutas()).toEqual(["PUT /api/x", "POST /api/auth/renovar", "PUT /api/x"]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ body: '{"a":1}', credentials: "include" });
  });

  it("las peticiones que vencen a la vez esperan una sola renovación", async () => {
    let renovaciones = 0;
    const vencidas = new Set<string>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/renovar") {
        renovaciones++;
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse(200, { user: {} });
      }
      if (!vencidas.has(url)) {
        vencidas.add(url);
        return expirado();
      }
      return jsonResponse(200, { url });
    });

    const respuestas = await Promise.all(["/api/a", "/api/b", "/api/c"].map((ruta) => apiFetch(ruta)));
    expect(respuestas).toEqual([{ url: "/api/a" }, { url: "/api/b" }, { url: "/api/c" }]);
    expect(renovaciones).toBe(1);

    // Una tanda posterior vuelve a renovar (no se queda con la promesa anterior).
    vencidas.clear();
    await apiFetch("/api/a");
    expect(renovaciones).toBe(2);
  });

  it("si la renovación falla llega su 401 y no se repite la petición", async () => {
    fetchMock
      .mockResolvedValueOnce(expirado())
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "SESION_REVOCADA", message: "Tu sesión se cerró" } }));

    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 401, code: "SESION_REVOCADA" });
    expect(rutas()).toEqual(["GET /api/x", "POST /api/auth/renovar"]);
  });

  it("solo renueva una vez: si tras renovar sigue vencido, llega el 401", async () => {
    fetchMock
      .mockResolvedValueOnce(expirado())
      .mockResolvedValueOnce(jsonResponse(200, { user: {} }))
      .mockResolvedValueOnce(expirado());

    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 401, code: "TOKEN_EXPIRADO" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("otros 401 (NO_AUTENTICADO, SESION_REVOCADA) no intentan renovar", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: "NO_AUTENTICADO", message: "No has iniciado sesión" } }));
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ code: "NO_AUTENTICADO" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("authApi", () => {
  it.each([
    ["registro", () => authApi.registro({} as never), "POST", "/api/auth/registro"],
    ["login", () => authApi.login({} as never), "POST", "/api/auth/login"],
    ["googleMock", () => authApi.googleMock({} as never), "POST", "/api/auth/google-mock"],
    ["completarPerfil", () => authApi.completarPerfil({} as never), "POST", "/api/auth/completar-perfil"],
    ["verificarWhatsapp", () => authApi.verificarWhatsapp({} as never), "POST", "/api/auth/verificar-whatsapp"],
    ["reenviarCodigo", () => authApi.reenviarCodigo(), "POST", "/api/auth/reenviar-codigo"],
    ["logout", () => authApi.logout(), "POST", "/api/auth/logout"],
    ["me", () => authApi.me(), "GET", "/api/auth/me"],
  ])("%s → %s %s", async (_, call, method, path) => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await call();
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method }));
  });
});
