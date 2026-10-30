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
