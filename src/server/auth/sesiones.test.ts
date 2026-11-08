import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/sesiones-${process.pid}`;
  return { dataDir: process.env.DATA_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import type { User } from "@/server/domain/user";
import { sesionRepository, userRepository } from "@/server/repositories";
import { jar } from "@/test/next-headers-mock";
import {
  cerrarOtrasSesiones,
  cerrarSesion,
  COOKIE_ACCESO,
  COOKIE_RENOVACION,
  iniciarSesion,
  reemitirAcceso,
  renovarSesion,
  sesionActual,
} from "./sesiones";
import { verificarAcceso, verificarRenovacion } from "./tokens";

const T0 = new Date("2026-11-07T18:00:00.000Z");
const mas = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

const readJson = async (file: string) => JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));
const cookie = (nombre: string) => jar.get(nombre)?.value;
/** Lo que un navegador guardaría: las dos cookies de este momento. */
const guardarCookies = () => new Map(jar);
const usarCookies = (copia: Map<string, { value: string; options: Record<string, unknown> }>) => {
  jar.clear();
  for (const [k, v] of copia) jar.set(k, v);
};

async function usuario(correo = "ana@ejemplo.com"): Promise<User> {
  return userRepository.create({
    nombre: "Ana",
    apellidoPaterno: "López",
    apellidoMaterno: "García",
    whatsapp: "+525512345678",
    correo,
    passwordHash: null,
    providers: ["google"],
    whatsappVerificado: true,
    correoVerificado: true,
    estado: "activo",
  });
}

beforeEach(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
  jar.clear();
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
});

afterAll(async () => {
  vi.useRealTimers();
  await rm(env.dataDir, { recursive: true, force: true });
});

describe("iniciarSesion", () => {
  it("crea la sesión en sesiones.json y pone las cookies acceso (path /) y renovacion (path /api/auth)", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, "Mozilla/5.0 ".repeat(30), T0);

    expect(sesion).toMatchObject({
      userId: user.id,
      jtiAnterior: null,
      creadaEn: T0.toISOString(),
      expiraEn: mas(7 * DIA).toISOString(),
      revocadaEn: null,
    });
    expect(sesion.agente).toHaveLength(200);
    expect(await readJson("sesiones.json")).toEqual({ version: 1, sesiones: [sesion] });

    expect(jar.get(COOKIE_ACCESO)?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 });
    expect(jar.get(COOKIE_RENOVACION)?.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/auth" });
    expect(await verificarAcceso(cookie(COOKIE_ACCESO))).toEqual({
      ok: true,
      datos: { sub: user.id, sid: sesion.id, idCliente: user.idCliente, estado: "activo" },
    });
    expect(await verificarRenovacion(cookie(COOKIE_RENOVACION))).toEqual({
      ok: true,
      datos: { sub: user.id, sid: sesion.id, jti: sesion.jtiVigente },
    });
  });
});

describe("sesionActual", () => {
  it("con acceso válido da usuario y sesión; vencido → token_expirado; sin cookie → sin_sesion", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    expect(await sesionActual(T0)).toMatchObject({ ok: true, user: { id: user.id }, sesion: { id: sesion.id } });

    vi.setSystemTime(mas(16 * MIN));
    expect(await sesionActual(mas(16 * MIN))).toEqual({ ok: false, motivo: "token_expirado" });
    jar.clear();
    expect(await sesionActual(T0)).toEqual({ ok: false, motivo: "sin_sesion" });
  });

  it("una sesión revocada corta de inmediato, aunque el token de acceso siga vigente", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    await cerrarOtrasSesiones(user.id, "otra", "otras_sesiones", T0);
    expect(await sesionActual(T0)).toEqual({ ok: false, motivo: "revocada", sid: sesion.id });
  });
});

describe("renovarSesion", () => {
  it("rota el jti, extiende 7 días y emite un acceso nuevo", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    vi.setSystemTime(mas(20 * MIN));
    const renovada = await renovarSesion(mas(20 * MIN));

    expect(renovada).toMatchObject({ ok: true, user: { id: user.id } });
    const guardada = await sesionRepository.findById(sesion.id);
    expect(guardada).toMatchObject({
      jtiAnterior: sesion.jtiVigente,
      renovadaEn: mas(20 * MIN).toISOString(),
      expiraEn: mas(20 * MIN + 7 * DIA).toISOString(),
    });
    expect(guardada!.jtiVigente).not.toBe(sesion.jtiVigente);
    expect(await verificarRenovacion(cookie(COOKIE_RENOVACION))).toMatchObject({ ok: true, datos: { jti: guardada!.jtiVigente } });
    expect(await sesionActual(mas(20 * MIN))).toMatchObject({ ok: true });
  });

  it("reusar un token ya rotado (fuera de la gracia de 10 s) revoca la sesión por reúso", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    const robadas = guardarCookies();
    await renovarSesion(mas(MIN));
    const legitimas = guardarCookies();

    usarCookies(robadas);
    expect(await renovarSesion(mas(MIN + 11_000))).toEqual({ ok: false, motivo: "reuso" });
    expect(await sesionRepository.findById(sesion.id)).toMatchObject({ motivoRevocacion: "reuso" });

    // El dueño también queda fuera: la sesión entera se revocó.
    usarCookies(legitimas);
    expect(await renovarSesion(mas(2 * MIN))).toEqual({ ok: false, motivo: "revocada" });
  });

  it("dos pestañas a la vez: el jti anterior dentro de 10 s recibe el vigente sin revocar ni rotar otra vez", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    const otraPestana = guardarCookies();
    await renovarSesion(mas(MIN));
    const vigente = (await sesionRepository.findById(sesion.id))!.jtiVigente;

    usarCookies(otraPestana);
    expect(await renovarSesion(mas(MIN + 5_000))).toMatchObject({ ok: true });
    expect(await verificarRenovacion(cookie(COOKIE_RENOVACION))).toMatchObject({ ok: true, datos: { jti: vigente } });
    expect(await sesionRepository.findById(sesion.id)).toMatchObject({ jtiVigente: vigente, revocadaEn: null });
  });

  it("sin cookie, sesión vencida o revocada no renueva", async () => {
    expect(await renovarSesion(T0)).toEqual({ ok: false, motivo: "sin_sesion" });
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    await sesionRepository.update(sesion.id, (s) => {
      s.expiraEn = mas(MIN).toISOString();
    });
    expect(await renovarSesion(mas(2 * MIN))).toEqual({ ok: false, motivo: "vencida" });
  });
});

describe("reemitirAcceso, cerrarSesion y cerrarOtrasSesiones", () => {
  it("reemitir cambia el estado del token de acceso, misma sesión", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion({ ...user, estado: "verificacion_pendiente" }, null, T0);
    await reemitirAcceso(user, sesion.id);
    expect(await verificarAcceso(cookie(COOKIE_ACCESO))).toMatchObject({ ok: true, datos: { sid: sesion.id, estado: "activo" } });
  });

  it("cerrar sesión revoca por logout y borra las cookies (y la session vieja)", async () => {
    const user = await usuario();
    const sesion = await iniciarSesion(user, null, T0);
    await cerrarSesion(sesion.id, T0);
    expect(await sesionRepository.findById(sesion.id)).toMatchObject({ revocadaEn: T0.toISOString(), motivoRevocacion: "logout" });
    for (const nombre of [COOKIE_ACCESO, COOKIE_RENOVACION, "session"]) {
      expect(jar.get(nombre)).toMatchObject({ value: "", options: { maxAge: 0 } });
    }
  });

  it("revoca las demás sesiones del usuario y conserva la actual y las de otros usuarios", async () => {
    const ana = await usuario();
    const beto = await usuario("beto@ejemplo.com");
    const actual = await iniciarSesion(ana, null, T0);
    const otra = await iniciarSesion(ana, null, T0);
    const tercera = await iniciarSesion(ana, null, T0);
    const deBeto = await iniciarSesion(beto, null, T0);

    expect(await cerrarOtrasSesiones(ana.id, actual.id, "cambio_contrasena", T0)).toBe(2);
    expect(await sesionRepository.findById(actual.id)).toMatchObject({ revocadaEn: null });
    expect(await sesionRepository.findById(otra.id)).toMatchObject({ motivoRevocacion: "cambio_contrasena" });
    expect(await sesionRepository.findById(tercera.id)).toMatchObject({ motivoRevocacion: "cambio_contrasena" });
    expect(await sesionRepository.findById(deBeto.id)).toMatchObject({ revocadaEn: null });
    expect(await cerrarOtrasSesiones(ana.id, actual.id, "otras_sesiones", T0)).toBe(0);
  });
});

describe("limpieza de sesiones.json", () => {
  it("al escribir se quitan las vencidas o revocadas hace más de 7 días", async () => {
    const user = await usuario();
    const vieja = await iniciarSesion(user, null, T0);
    const revocada = await iniciarSesion(user, null, T0);
    await cerrarSesion(revocada.id, T0);

    // 15 días después: la vieja venció a los 7 y hace 8 que no sirve; la revocada, hace 15.
    const nueva = await iniciarSesion(user, null, mas(15 * DIA));
    const { sesiones } = await readJson("sesiones.json");
    expect(sesiones.map((s: { id: string }) => s.id)).toEqual([nueva.id]);
    expect(await sesionRepository.findById(vieja.id)).toBeNull();
  });
});
