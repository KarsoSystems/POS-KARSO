import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/perfil-routes-${process.pid}`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { dataDir: process.env.DATA_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as login } from "@/app/api/auth/login/route";
import { userRepository } from "@/server/repositories";
import { jar } from "@/test/next-headers-mock";
import { iniciarSesionActiva } from "@/test/sesion";
import { DELETE as borrarFiscales, PUT as guardarFiscales } from "./datos-fiscales/route";
import { PUT as cambiarContrasena } from "./contrasena/route";
import { PUT as guardarDireccion } from "./direccion/route";
import { POST as reenviarTelefono } from "./telefono/reenviar/route";
import { DELETE as cancelarTelefono, GET as telefonoEnCurso, POST as pedirTelefono } from "./telefono/route";
import { POST as verificarTelefono } from "./telefono/verificar/route";

const json = (method: string, body: unknown) =>
  new Request("http://localhost/api/perfil", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const readJson = async (file: string) => JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));

const direccion = { calle: "Av. Juárez 123", colonia: "Centro", ciudad: "Monterrey", estado: "Nuevo León", codigoPostal: "64000" };
const fiscales = {
  rfc: "PELJ800101ABC",
  razonSocial: "Juan Pérez López",
  regimenFiscal: "612",
  codigoPostal: "64000",
  usoCfdi: "G03",
  correoFactura: "facturas@elaguila.com",
};

beforeEach(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
  jar.clear();
});

afterAll(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
});

describe("PUT /api/perfil/direccion", () => {
  it("socio sin negocio ni dirección → 422 por campo y no guarda; con todo → socio", async () => {
    const user = await iniciarSesionActiva();
    const incompleto = await guardarDireccion(json("PUT", { tipo: "socio", nombreNegocio: "", direccion: null }));
    expect(incompleto.status).toBe(422);
    expect((await incompleto.json()).error.fields).toEqual({
      nombreNegocio: "El nombre del negocio es obligatorio para socios",
      direccion: "La dirección es obligatoria para socios",
    });
    expect(await userRepository.findById(user.id)).toMatchObject({ tipo: "ocasional", direccion: null, nombreNegocio: null });

    const res = await guardarDireccion(json("PUT", { tipo: "socio", nombreNegocio: "Imprenta El Águila", direccion }));
    expect(res.status).toBe(200);
    const { user: guardado } = await res.json();
    expect(guardado).toMatchObject({ tipo: "socio", nombreNegocio: "Imprenta El Águila", direccion });
    expect(guardado).not.toHaveProperty("passwordHash");
    expect((await readJson("users.json")).users[0]).toMatchObject({ tipo: "socio", direccion });
  });

  it("de socio a ocasional se borra el negocio y queda la dirección que manda; un ocasional puede no tener dirección", async () => {
    await iniciarSesionActiva();
    await guardarDireccion(json("PUT", { tipo: "socio", nombreNegocio: "Imprenta El Águila", direccion }));
    const ocasional = await (await guardarDireccion(json("PUT", { tipo: "ocasional", nombreNegocio: "Imprenta El Águila", direccion }))).json();
    expect(ocasional.user).toMatchObject({ tipo: "ocasional", nombreNegocio: null, direccion });

    const sinDireccion = await (await guardarDireccion(json("PUT", { tipo: "ocasional", nombreNegocio: null, direccion: null }))).json();
    expect(sinDireccion.user).toMatchObject({ tipo: "ocasional", direccion: null });
  });

  it("una dirección a medias → 422 en ese campo; no toca los datos fiscales", async () => {
    const user = await iniciarSesionActiva();
    await guardarFiscales(json("PUT", { datosFiscales: fiscales }));
    const res = await guardarDireccion(json("PUT", { tipo: "ocasional", nombreNegocio: null, direccion: { ...direccion, calle: "" } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ "direccion.calle": "La calle es obligatoria" });

    await guardarDireccion(json("PUT", { tipo: "ocasional", nombreNegocio: null, direccion }));
    expect((await userRepository.findById(user.id))?.datosFiscales).toMatchObject({ rfc: "PELJ800101ABC" });
  });

  it("sin sesión → 401", async () => {
    expect((await guardarDireccion(json("PUT", { tipo: "ocasional", nombreNegocio: null, direccion: null }))).status).toBe(401);
  });
});

describe("PUT y DELETE /api/perfil/datos-fiscales", () => {
  it("guarda los datos fiscales normalizados; un RFC inválido → 422 en su campo", async () => {
    const user = await iniciarSesionActiva();
    const res = await guardarFiscales(json("PUT", { datosFiscales: fiscales }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.datosFiscales).toEqual({ ...fiscales, razonSocial: "JUAN PÉREZ LÓPEZ" });

    const invalido = await guardarFiscales(json("PUT", { datosFiscales: { ...fiscales, rfc: "XYZ" } }));
    expect(invalido.status).toBe(422);
    expect((await invalido.json()).error.fields).toEqual({ "datosFiscales.rfc": "RFC inválido" });
    expect((await userRepository.findById(user.id))?.datosFiscales?.rfc).toBe("PELJ800101ABC");
  });

  it("DELETE los borra y no toca la dirección", async () => {
    const user = await iniciarSesionActiva();
    await guardarDireccion(json("PUT", { tipo: "ocasional", nombreNegocio: null, direccion }));
    await guardarFiscales(json("PUT", { datosFiscales: fiscales }));
    const res = await borrarFiscales();
    expect(res.status).toBe(200);
    expect((await res.json()).user.datosFiscales).toBeNull();
    expect(await userRepository.findById(user.id)).toMatchObject({ datosFiscales: null, direccion });
  });

  it("sin sesión → 401", async () => {
    expect((await borrarFiscales()).status).toBe(401);
  });
});

describe("PUT /api/perfil/contrasena", () => {
  const entrar = (password: string) =>
    login(json("POST", { correo: "ana@ejemplo.com", password }));

  it("cambia la contraseña: la nueva inicia sesión y la anterior ya no", async () => {
    const user = await iniciarSesionActiva();
    expect((await cambiarContrasena(json("PUT", { password: "primera123", confirmacion: "primera123" }))).status).toBe(200);
    const res = await cambiarContrasena(json("PUT", { password: "segunda456", confirmacion: "segunda456" }));
    expect(res.status).toBe(200);
    expect((await res.json()).user).not.toHaveProperty("passwordHash");

    expect((await entrar("primera123")).status).toBe(401);
    expect((await entrar("segunda456")).status).toBe(200);
    expect((await userRepository.findById(user.id))?.providers).toEqual(["google", "password"]);
  });

  it("una cuenta solo de Google crea su contraseña y suma \"password\" a providers una sola vez", async () => {
    const user = await iniciarSesionActiva();
    expect(user).toMatchObject({ passwordHash: null, providers: ["google"] });
    expect((await entrar("creada123")).status).toBe(401);

    const res = await cambiarContrasena(json("PUT", { password: "creada123", confirmacion: "creada123" }));
    expect((await res.json()).user.providers).toEqual(["google", "password"]);
    expect((await entrar("creada123")).status).toBe(200);
    await cambiarContrasena(json("PUT", { password: "otra12345", confirmacion: "otra12345" }));
    expect((await userRepository.findById(user.id))?.providers).toEqual(["google", "password"]);
  });

  it("si no coinciden o no cumplen las reglas del registro → 422 por campo y no cambia", async () => {
    const user = await iniciarSesionActiva();
    const distinta = await cambiarContrasena(json("PUT", { password: "nueva1234", confirmacion: "nueva9999" }));
    expect(distinta.status).toBe(422);
    expect((await distinta.json()).error.fields).toEqual({ confirmacion: "Las contraseñas no coinciden" });
    const debil = await cambiarContrasena(json("PUT", { password: "sinnumeros", confirmacion: "sinnumeros" }));
    expect((await debil.json()).error.fields).toEqual({ password: "La contraseña debe incluir al menos un número" });
    expect((await userRepository.findById(user.id))?.passwordHash).toBeNull();
  });

  it("sin sesión → 401", async () => {
    expect((await cambiarContrasena(json("PUT", { password: "nueva1234", confirmacion: "nueva1234" }))).status).toBe(401);
  });
});

describe("cambio de teléfono (/api/perfil/telefono)", () => {
  const NUEVO = "+528187654321";
  const pedir = (whatsapp: string) => pedirTelefono(json("POST", { whatsapp }));
  const verificar = (codigo: string) => verificarTelefono(json("POST", { codigo }));
  const enCurso = async () => (await (await telefonoEnCurso()).json()).whatsappNuevo;
  const otro = (codigo: string) => String((Number(codigo) + 1) % 1_000_000).padStart(6, "0");
  let consola: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consola = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T18:00:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
    consola.mockRestore();
  });

  it("envía el código al número nuevo; el teléfono no cambia hasta verificar; con el código correcto cambia", async () => {
    const user = await iniciarSesionActiva();
    const res = await pedir("81 8765 4321");
    expect(res.status).toBe(200);
    const { whatsappNuevo, demoCodigo, reenviarEn } = await res.json();
    expect({ whatsappNuevo, reenviarEn }).toEqual({ whatsappNuevo: NUEVO, reenviarEn: 60 });
    expect(consola).toHaveBeenCalledWith(`[DEMO WHATSAPP] Código para ${NUEVO} (${user.idCliente}): ${demoCodigo}`);
    expect((await userRepository.findById(user.id))?.whatsapp).toBe("+525512345678");
    expect(await enCurso()).toBe(NUEVO);

    const ok = await verificar(demoCodigo);
    expect(ok.status).toBe(200);
    expect((await ok.json()).user).toMatchObject({ whatsapp: NUEVO, whatsappVerificado: true });
    expect(await enCurso()).toBeNull();
  });

  it("un código incorrecto da los intentos restantes y no cambia; al 5.º se agota y hay que pedir el cambio otra vez", async () => {
    const user = await iniciarSesionActiva();
    const { demoCodigo } = await (await pedir(NUEVO)).json();
    const malo = await verificar(otro(demoCodigo));
    expect(malo.status).toBe(422);
    expect((await malo.json()).error.fields).toEqual({ codigo: "Código incorrecto. Te quedan 4 intentos." });
    for (let i = 0; i < 3; i++) await verificar(otro(demoCodigo));
    const agotado = await verificar(otro(demoCodigo));
    expect(agotado.status).toBe(410);
    expect((await agotado.json()).error.code).toBe("CODIGO_AGOTADO");
    expect(await enCurso()).toBeNull();
    expect((await verificar(demoCodigo)).status).toBe(410);
    expect((await userRepository.findById(user.id))?.whatsapp).toBe("+525512345678");
  });

  it("un código expirado pide uno nuevo; reenviar antes de 60 s → 429 y después envía otro al número nuevo", async () => {
    await iniciarSesionActiva();
    const { demoCodigo } = await (await pedir(NUEVO)).json();
    const pronto = await reenviarTelefono();
    expect(pronto.status).toBe(429);
    expect(pronto.headers.get("Retry-After")).toBe("60");

    vi.setSystemTime(new Date("2026-11-07T18:11:00.000Z"));
    const expirado = await verificar(demoCodigo);
    expect((await expirado.json()).error.code).toBe("CODIGO_EXPIRADO");
    const reenvio = await reenviarTelefono();
    expect(reenvio.status).toBe(200);
    const nuevo = await reenvio.json();
    expect(nuevo.whatsappNuevo).toBe(NUEVO);
    expect((await verificar(nuevo.demoCodigo)).status).toBe(200);
  });

  it("cancelar deja el número anterior sin cambio en curso; reenviar o verificar sin cambio → 410 SIN_CODIGO", async () => {
    const user = await iniciarSesionActiva();
    const { demoCodigo } = await (await pedir(NUEVO)).json();
    expect(await (await cancelarTelefono()).json()).toEqual({ whatsappNuevo: null });
    expect(await enCurso()).toBeNull();
    expect((await (await verificar(demoCodigo)).json()).error.code).toBe("SIN_CODIGO");
    expect((await reenviarTelefono()).status).toBe(410);
    expect((await userRepository.findById(user.id))?.whatsapp).toBe("+525512345678");
  });

  it("el número actual o uno inválido → 422", async () => {
    await iniciarSesionActiva();
    const igual = await pedir("55 1234 5678");
    expect(igual.status).toBe(422);
    expect((await igual.json()).error.fields).toEqual({ whatsapp: "Ese ya es tu número" });
    const invalido = await pedir("123");
    expect((await invalido.json()).error.fields).toEqual({ whatsapp: "El WhatsApp debe tener 10 dígitos" });
    expect(await enCurso()).toBeNull();
  });

  it("sin sesión → 401", async () => {
    expect((await telefonoEnCurso()).status).toBe(401);
    expect((await pedir(NUEVO)).status).toBe(401);
  });
});
