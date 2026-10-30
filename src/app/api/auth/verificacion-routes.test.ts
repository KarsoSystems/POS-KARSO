import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/verificacion-routes-${process.pid}`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { dataDir: process.env.DATA_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as registro } from "./registro/route";
import { POST as reenviar } from "./reenviar-codigo/route";
import { POST as verificar } from "./verificar-whatsapp/route";
import { getSession } from "@/server/auth/session";
import { jar } from "@/test/next-headers-mock";

const post = (body?: unknown) =>
  new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const readJson = async (file: string) =>
  JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));

/** Registra un usuario (deja la cookie puesta) y devuelve su código. */
async function registrar(): Promise<{ codigo: string; userId: string }> {
  const body = await (
    await registro(
      post({
        nombre: "Ana",
        apellidoPaterno: "López",
        apellidoMaterno: "García",
        whatsapp: "5512345678",
        correo: "ana@ejemplo.com",
        password: "secreto123",
      }),
    )
  ).json();
  return { codigo: body.demoCodigo, userId: body.user.id };
}

/** Un código de 6 dígitos distinto al correcto. */
const otroCodigo = (codigo: string) => String((Number(codigo) + 1) % 1_000_000).padStart(6, "0");

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
  jar.clear();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  // Solo se falsea Date: los timers reales siguen funcionando para fs.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-30T12:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
});

describe("POST /api/auth/verificar-whatsapp", () => {
  it("un código correcto activa la cuenta, reemite la cookie y borra la verificación", async () => {
    const { codigo } = await registrar();
    const res = await verificar(post({ codigo }));
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user).toMatchObject({ estado: "activo", whatsappVerificado: true });
    expect((await getSession())?.estado).toBe("activo");
    expect((await readJson("users.json")).users[0].estado).toBe("activo");
    expect((await readJson("verifications.json")).items).toEqual([]);
  });

  it("un código incorrecto da 422 'Código incorrecto' y suma un intento", async () => {
    const { codigo } = await registrar();
    const res = await verificar(post({ codigo: otroCodigo(codigo) }));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error).toMatchObject({ code: "CODIGO_INCORRECTO", message: "Código incorrecto" });
    expect(error.fields.codigo).toBe("Código incorrecto. Te quedan 4 intentos.");
    expect((await readJson("verifications.json")).items[0].intentos).toBe(1);
  });

  it("el 5.º intento fallido invalida el código: ni el correcto sirve después", async () => {
    const { codigo } = await registrar();
    for (let i = 0; i < 4; i++) {
      expect((await verificar(post({ codigo: otroCodigo(codigo) }))).status).toBe(422);
    }
    const quinto = await verificar(post({ codigo: otroCodigo(codigo) }));
    expect(quinto.status).toBe(410);
    expect((await quinto.json()).error.code).toBe("CODIGO_AGOTADO");
    expect((await readJson("verifications.json")).items).toEqual([]);

    const correcto = await verificar(post({ codigo }));
    expect(correcto.status).toBe(410);
    expect((await correcto.json()).error.code).toBe("SIN_CODIGO");
  });

  it("un código vencido (10 min) da 410 CODIGO_EXPIRADO", async () => {
    const { codigo } = await registrar();
    vi.setSystemTime(new Date("2026-10-30T12:10:00.000Z"));
    const res = await verificar(post({ codigo }));
    expect(res.status).toBe(410);
    expect((await res.json()).error.code).toBe("CODIGO_EXPIRADO");
  });

  it("422 de validación si el código no tiene 6 dígitos", async () => {
    await registrar();
    const res = await verificar(post({ codigo: "12" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDACION");
  });

  it("401 sin sesión", async () => {
    const res = await verificar(post({ codigo: "123456" }));
    expect(res.status).toBe(401);
  });

  it("409 si la cuenta ya está activa", async () => {
    const { codigo } = await registrar();
    await verificar(post({ codigo }));
    const res = await verificar(post({ codigo }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ESTADO_INVALIDO");
  });
});

describe("POST /api/auth/reenviar-codigo", () => {
  it("antes de 60 s responde 429 con Retry-After", async () => {
    await registrar();
    vi.setSystemTime(new Date("2026-10-30T12:00:20.000Z"));
    const res = await reenviar();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("40");
    expect((await res.json()).error).toMatchObject({
      code: "REENVIO_PRONTO",
      message: "Espera 40 s para pedir otro código.",
    });
  });

  it("después de 60 s genera un código nuevo, reinicia intentos y vigencia", async () => {
    const { codigo } = await registrar();
    await verificar(post({ codigo: otroCodigo(codigo) }));
    vi.setSystemTime(new Date("2026-10-30T12:01:00.000Z"));

    const res = await reenviar();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reenviarEn: 60, demoCodigo: expect.stringMatching(/^\d{6}$/) });

    const [item] = (await readJson("verifications.json")).items;
    expect(item).toMatchObject({
      codigo: body.demoCodigo,
      intentos: 0,
      ultimoEnvio: "2026-10-30T12:01:00.000Z",
      expiresAt: "2026-10-30T12:11:00.000Z",
    });
    expect(logSpy).toHaveBeenLastCalledWith(expect.stringContaining(`[DEMO WHATSAPP]`));
    expect((await verificar(post({ codigo: body.demoCodigo }))).status).toBe(200);
  });

  it("tras agotar intentos se puede pedir otro código (pasado el cooldown)", async () => {
    const { codigo } = await registrar();
    for (let i = 0; i < 5; i++) await verificar(post({ codigo: otroCodigo(codigo) }));
    expect((await reenviar()).status).toBe(200); // sin verificación vigente no hay cooldown
  });

  it("no devuelve el código en producción", async () => {
    await registrar();
    vi.setSystemTime(new Date("2026-10-30T12:01:00.000Z"));
    vi.stubEnv("NODE_ENV", "production");
    expect(await (await reenviar()).json()).toEqual({ reenviarEn: 60 });
  });

  it("401 sin sesión", async () => {
    expect((await reenviar()).status).toBe(401);
  });
});
