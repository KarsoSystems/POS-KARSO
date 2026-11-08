import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/google-routes-${process.pid}`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { dataDir: process.env.DATA_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as completarPerfil } from "./completar-perfil/route";
import { POST as googleMock } from "./google-mock/route";
import { POST as login } from "./login/route";
import { POST as registro } from "./registro/route";
import { POST as verificar } from "./verificar-whatsapp/route";
import { accesoActual } from "@/test/sesion";
import { jar } from "@/test/next-headers-mock";

const post = (body: unknown) =>
  new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const readJson = async (file: string) =>
  JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));

const perfil = {
  nombre: "Luis",
  apellidoPaterno: "Pérez",
  apellidoMaterno: "Soto",
  whatsapp: "(33) 1234-5678",
};

beforeEach(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
  jar.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
});

describe("POST /api/auth/google-mock", () => {
  it("un correo nuevo crea un usuario google en perfil_incompleto (201)", async () => {
    const res = await googleMock(post({ nombre: "Luis", correo: "Luis@Gmail.com" }));
    expect(res.status).toBe(201);
    const { user } = await res.json();
    expect(user).toMatchObject({
      idCliente: "CLI-000001",
      nombre: "Luis",
      correo: "luis@gmail.com",
      apellidoPaterno: null,
      apellidoMaterno: null,
      whatsapp: null,
      providers: ["google"],
      correoVerificado: true,
      whatsappVerificado: false,
      estado: "perfil_incompleto",
    });
    expect((await readJson("users.json")).users[0].passwordHash).toBeNull();
    expect((await accesoActual())?.estado).toBe("perfil_incompleto");
  });

  it("el correo de una cuenta por contraseña inicia sesión en la misma cuenta y agrega google", async () => {
    const creado = await (
      await registro(
        post({ ...perfil, correo: "luis@gmail.com", password: "secreto123", whatsapp: "3312345678" }),
      )
    ).json();
    jar.clear();

    const res = await googleMock(post({ nombre: "Otro Nombre", correo: "LUIS@gmail.com" }));
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.id).toBe(creado.user.id);
    expect(user.idCliente).toBe(creado.user.idCliente);
    expect(user.providers).toEqual(["password", "google"]);
    expect(user.nombre).toBe("Luis"); // no se sobrescribe con el de Google
    expect(user.estado).toBe("verificacion_pendiente");
    expect((await accesoActual())?.sub).toBe(creado.user.id);
    expect((await readJson("users.json")).users).toHaveLength(1);
  });

  it("entrar dos veces con Google no duplica el provider ni el usuario", async () => {
    await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }));
    const { user } = await (await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }))).json();
    expect(user.providers).toEqual(["google"]);
    expect((await readJson("users.json")).users).toHaveLength(1);
  });

  it("422 si falta el nombre o el correo es inválido", async () => {
    const res = await googleMock(post({ nombre: "", correo: "no-es-correo" }));
    expect(res.status).toBe(422);
    expect(Object.keys((await res.json()).error.fields)).toEqual(["nombre", "correo"]);
  });

  it("una cuenta solo de Google no puede entrar por contraseña (401 genérico)", async () => {
    await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }));
    const res = await login(post({ correo: "luis@gmail.com", password: "cualquiera1" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe("Correo o contraseña incorrectos");
  });
});

describe("POST /api/auth/completar-perfil", () => {
  it("guarda apellidos y WhatsApp, pasa a verificacion_pendiente y genera código", async () => {
    await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }));
    const res = await completarPerfil(post(perfil));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      apellidoPaterno: "Pérez",
      apellidoMaterno: "Soto",
      whatsapp: "+523312345678",
      estado: "verificacion_pendiente",
    });
    expect(body.demoCodigo).toMatch(/^\d{6}$/);
    expect((await accesoActual())?.estado).toBe("verificacion_pendiente");
    expect((await readJson("verifications.json")).items).toHaveLength(1);
  });

  it("flujo completo Google → completar → verificar deja la cuenta activa, en la misma sesión", async () => {
    await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }));
    const { sid } = (await accesoActual())!;
    const { demoCodigo } = await (await completarPerfil(post(perfil))).json();
    const res = await verificar(post({ codigo: demoCodigo }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.estado).toBe("activo");
    // Cada cambio de estado reemite el acceso con el estado nuevo, sin abrir otra sesión.
    expect(await accesoActual()).toMatchObject({ estado: "activo", sid });
    expect((await readJson("sesiones.json")).sesiones).toHaveLength(1);
  });

  it("422 si faltan apellidos o el WhatsApp es inválido", async () => {
    await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }));
    const res = await completarPerfil(post({ ...perfil, apellidoMaterno: "", whatsapp: "123" }));
    expect(res.status).toBe(422);
    expect(Object.keys((await res.json()).error.fields)).toEqual(["apellidoMaterno", "whatsapp"]);
  });

  it("401 sin sesión", async () => {
    expect((await completarPerfil(post(perfil))).status).toBe(401);
  });

  it("409 si el perfil ya estaba completo", async () => {
    await googleMock(post({ nombre: "Luis", correo: "luis@gmail.com" }));
    await completarPerfil(post(perfil));
    const res = await completarPerfil(post(perfil));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ESTADO_INVALIDO");
  });
});
