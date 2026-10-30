import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// DATA_DIR y AUTH_SECRET deben existir antes de importar los repositorios.
const env = vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/auth-routes-${process.pid}`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { dataDir: process.env.DATA_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "./me/route";
import { POST as registro } from "./registro/route";
import { getSession, SESSION_COOKIE } from "@/server/auth/session";
import { jar } from "@/test/next-headers-mock";

const post = (body: unknown) =>
  new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const registroValido = {
  nombre: "Ana",
  apellidoPaterno: "López",
  apellidoMaterno: "García",
  whatsapp: "55 1234 5678",
  correo: "Ana@Ejemplo.com",
  password: "secreto123",
};

const readJson = async (file: string) =>
  JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
  jar.clear();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(async () => {
  await rm(env.dataDir, { recursive: true, force: true });
});

describe("POST /api/auth/registro", () => {
  it("crea el usuario CLI-000001 en verificacion_pendiente y pone la cookie", async () => {
    const res = await registro(post(registroValido));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({
      idCliente: "CLI-000001",
      correo: "ana@ejemplo.com",
      whatsapp: "+525512345678",
      estado: "verificacion_pendiente",
      providers: ["password"],
      whatsappVerificado: false,
      correoVerificado: false,
    });
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(await getSession()).toEqual({
      sub: body.user.id,
      idCliente: "CLI-000001",
      estado: "verificacion_pendiente",
    });
    expect(jar.get(SESSION_COOKIE)?.options).toMatchObject({ httpOnly: true });
  });

  it("guarda la contraseña hasheada y nunca en texto plano", async () => {
    await registro(post(registroValido));
    const { users } = await readJson("users.json");
    expect(users[0].passwordHash).toMatch(/^\$2/);
    for (const file of await readdir(env.dataDir)) {
      expect(await readFile(path.join(env.dataDir, file), "utf8")).not.toContain("secreto123");
    }
  });

  it("genera el código, lo escribe en consola con [DEMO WHATSAPP] y lo devuelve fuera de producción", async () => {
    const body = await (await registro(post(registroValido))).json();
    expect(body.demoCodigo).toMatch(/^\d{6}$/);
    const { items } = await readJson("verifications.json");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ userId: body.user.id, codigo: body.demoCodigo, intentos: 0 });
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[DEMO WHATSAPP\].*\d{6}$/));
  });

  it("no devuelve el código en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const body = await (await registro(post(registroValido))).json();
      expect(body).not.toHaveProperty("demoCodigo");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("409 con error en el campo correo si el correo ya existe (sin importar mayúsculas)", async () => {
    await registro(post(registroValido));
    const res = await registro(post({ ...registroValido, correo: "ANA@ejemplo.com" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "CORREO_DUPLICADO",
        message: "Este correo ya está registrado",
        fields: { correo: "Este correo ya está registrado" },
      },
    });
  });

  it("422 con errores por campo si la validación falla", async () => {
    const res = await registro(post({ ...registroValido, whatsapp: "123", password: "abcdefgh" }));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDACION");
    expect(error.fields).toEqual({
      whatsapp: "El WhatsApp debe tener 10 dígitos",
      password: "La contraseña debe incluir al menos un número",
    });
  });

  it("400 si el body no es JSON", async () => {
    const res = await registro(post("{no-json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("JSON_INVALIDO");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await registro(post(registroValido));
    jar.clear();
  });

  it("inicia sesión con correo (sin importar mayúsculas) y contraseña", async () => {
    const res = await login(post({ correo: "ANA@ejemplo.com", password: "secreto123" }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.idCliente).toBe("CLI-000001");
    expect((await getSession())?.idCliente).toBe("CLI-000001");
  });

  it("contraseña incorrecta y correo inexistente dan el mismo 401 genérico", async () => {
    const malPassword = await login(post({ correo: "ana@ejemplo.com", password: "otra1234" }));
    const sinCuenta = await login(post({ correo: "nadie@ejemplo.com", password: "secreto123" }));
    const esperado = {
      error: { code: "CREDENCIALES_INVALIDAS", message: "Correo o contraseña incorrectos" },
    };
    expect(malPassword.status).toBe(401);
    expect(sinCuenta.status).toBe(401);
    expect(await malPassword.json()).toEqual(esperado);
    expect(await sinCuenta.json()).toEqual(esperado);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("422 si falta la contraseña", async () => {
    const res = await login(post({ correo: "ana@ejemplo.com", password: "" }));
    expect(res.status).toBe(422);
  });
});

describe("GET /api/auth/me y POST /api/auth/logout", () => {
  it("me devuelve el usuario público con sesión", async () => {
    await registro(post(registroValido));
    const res = await me();
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.idCliente).toBe("CLI-000001");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("me da 401 sin sesión", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("NO_AUTENTICADO");
  });

  it("me da 401 y limpia la cookie si el usuario ya no existe", async () => {
    await registro(post(registroValido));
    await rm(env.dataDir, { recursive: true, force: true });
    const res = await me();
    expect(res.status).toBe(401);
    expect(jar.get(SESSION_COOKIE)?.value).toBe("");
  });

  it("logout borra la cookie y me deja de responder", async () => {
    await registro(post(registroValido));
    const res = await logout();
    expect(res.status).toBe(200);
    expect(jar.get(SESSION_COOKIE)).toMatchObject({ value: "", options: { maxAge: 0 } });
    expect((await me()).status).toBe(401);
  });
});
