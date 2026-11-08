import { rm } from "node:fs/promises";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/sesion-routes-${process.pid}`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { dataDir: process.env.DATA_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { GET as me } from "./me/route";
import { GET as renovarGet, POST as renovarPost } from "./renovar/route";
import { cerrarOtrasSesiones, COOKIE_ACCESO, COOKIE_RENOVACION } from "@/server/auth/sesiones";
import { userRepository, sesionRepository } from "@/server/repositories";
import { jar } from "@/test/next-headers-mock";
import { accesoActual, iniciarSesionActiva } from "@/test/sesion";

// SPEC 11: lo que responden las rutas con el token de acceso vencido o la sesión
// revocada, y la renovación (GET para el middleware, POST para apiFetch).

const MIN = 60_000;
const T0 = new Date("2026-11-07T18:00:00.000Z");
const reloj = (ms: number) => vi.setSystemTime(new Date(T0.getTime() + ms));
const codigo = async (res: Response) => (await res.json()).error.code;
const borrada = (nombre: string) => expect(jar.get(nombre)).toMatchObject({ value: "", options: { maxAge: 0 } });
const getRenovar = (siguiente?: string) =>
  renovarGet(new NextRequest(`http://localhost/api/auth/renovar${siguiente ? `?siguiente=${encodeURIComponent(siguiente)}` : ""}`));

beforeEach(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
  jar.clear();
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
});

afterEach(() => vi.useRealTimers());

afterAll(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
});

describe("rutas con sesión (requireSessionUser)", () => {
  it("acceso vencido → 401 TOKEN_EXPIRADO sin borrar las cookies", async () => {
    await iniciarSesionActiva();
    reloj(16 * MIN);
    const res = await me();
    expect(res.status).toBe(401);
    expect(await codigo(res)).toBe("TOKEN_EXPIRADO");
    expect(jar.get(COOKIE_ACCESO)?.value).not.toBe("");
    expect(jar.get(COOKIE_RENOVACION)?.value).not.toBe("");
  });

  it("sesión revocada desde otro dispositivo → 401 SESION_REVOCADA de inmediato y borra las cookies", async () => {
    const user = await iniciarSesionActiva();
    await cerrarOtrasSesiones(user.id, "otro-dispositivo", "otras_sesiones");
    const res = await me();
    expect(res.status).toBe(401);
    expect(await codigo(res)).toBe("SESION_REVOCADA");
    borrada(COOKIE_ACCESO);
    borrada(COOKIE_RENOVACION);
  });

  it("sin cookie o con un token inválido → 401 NO_AUTENTICADO", async () => {
    expect(await codigo(await me())).toBe("NO_AUTENTICADO");
    jar.set(COOKIE_ACCESO, { value: "basura", options: {} });
    expect(await codigo(await me())).toBe("NO_AUTENTICADO");
  });
});

describe("POST /api/auth/renovar", () => {
  it("renueva: { user } y un acceso nuevo de la misma sesión, con el que la API vuelve a responder", async () => {
    const user = await iniciarSesionActiva();
    const { sid } = (await accesoActual())!;
    reloj(16 * MIN);
    const res = await renovarPost();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ id: user.id, idCliente: user.idCliente });
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(await accesoActual()).toMatchObject({ sid, sub: user.id });
    expect((await me()).status).toBe(200);
  });

  it("con el estado actual de la cuenta, no el del token anterior", async () => {
    const user = await iniciarSesionActiva();
    await userRepository.update(user.id, { estado: "verificacion_pendiente" });
    await renovarPost();
    expect((await accesoActual())?.estado).toBe("verificacion_pendiente");
  });

  it("reusar un token de renovación ya rotado → 401 SESION_REVOCADA, la sesión queda revocada por reuso", async () => {
    await iniciarSesionActiva();
    const { sid } = (await accesoActual())!;
    const robadas = new Map(jar);
    await renovarPost();

    reloj(MIN);
    jar.clear();
    for (const [k, v] of robadas) jar.set(k, v);
    const res = await renovarPost();
    expect(res.status).toBe(401);
    expect(await codigo(res)).toBe("SESION_REVOCADA");
    expect(await sesionRepository.findById(sid)).toMatchObject({ motivoRevocacion: "reuso" });
    borrada(COOKIE_RENOVACION);
  });

  it("sin cookie → 401 NO_AUTENTICADO; sesión vencida → 401 SESION_VENCIDA", async () => {
    expect(await codigo(await renovarPost())).toBe("NO_AUTENTICADO");
    await iniciarSesionActiva();
    const { sid } = (await accesoActual())!;
    await sesionRepository.update(sid, (s) => {
      s.expiraEn = new Date(T0.getTime() + MIN).toISOString();
    });
    reloj(2 * MIN);
    expect(await codigo(await renovarPost())).toBe("SESION_VENCIDA");
  });
});

describe("GET /api/auth/renovar?siguiente= (middleware)", () => {
  it("renueva y vuelve a la página del panel", async () => {
    await iniciarSesionActiva();
    reloj(16 * MIN);
    const res = await getRenovar("/panel/pedidos/abc?x=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/panel/pedidos/abc?x=1");
    expect((await me()).status).toBe(200);
  });

  it("nunca redirige fuera de la tienda: un siguiente externo va al inicio del panel", async () => {
    await iniciarSesionActiva();
    for (const siguiente of ["https://otro.sitio/panel/x", "//otro.sitio", undefined]) {
      expect((await getRenovar(siguiente)).headers.get("location")).toBe("http://localhost/panel");
      jar.clear();
      await iniciarSesionActiva(`otra-${Math.random()}@ejemplo.com`);
    }
  });

  it("si no puede renovar, borra las dos cookies y manda a /login conservando siguiente", async () => {
    await iniciarSesionActiva();
    jar.delete(COOKIE_RENOVACION);
    const res = await getRenovar("/panel/pedidos/abc");
    expect(res.headers.get("location")).toBe(`http://localhost/login?siguiente=${encodeURIComponent("/panel/pedidos/abc")}`);
    borrada(COOKIE_ACCESO);
    borrada(COOKIE_RENOVACION);
  });
});
