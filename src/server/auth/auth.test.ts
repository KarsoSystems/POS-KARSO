import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jar } from "@/test/next-headers-mock";
import { hashPassword, verifyPassword } from "./password";
import {
  clearSession,
  getAuthSecret,
  getSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  setSession,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session";

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

const SECRET = "x".repeat(32);
const payload: SessionPayload = { sub: "user-1", idCliente: "CLI-000001", estado: "activo" };

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  jar.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("getAuthSecret", () => {
  it("lanza si falta AUTH_SECRET", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => getAuthSecret()).toThrow("AUTH_SECRET");
  });

  it("lanza si tiene menos de 32 caracteres", () => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(31));
    expect(() => getAuthSecret()).toThrow("al menos 32 caracteres");
  });

  it("acepta 32 caracteres", () => {
    expect(getAuthSecret()).toBeInstanceOf(Uint8Array);
  });
});

describe("token de sesión", () => {
  it("firma y verifica el payload", async () => {
    const token = await signSessionToken(payload);
    expect(await verifySessionToken(token)).toEqual(payload);
  });

  it("usa HS256", async () => {
    const token = await signSessionToken(payload);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(header.alg).toBe("HS256");
  });

  it("rechaza un token vacío o basura", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("no-es-un-jwt")).toBeNull();
  });

  it("rechaza un token alterado", async () => {
    const [header, , signature] = (await signSessionToken(payload)).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, estado: "activo", sub: "otro" })).toString(
      "base64url",
    );
    expect(await verifySessionToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const token = await signSessionToken(payload);
    vi.stubEnv("AUTH_SECRET", "y".repeat(32));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rechaza un token expirado (7 días)", async () => {
    vi.useFakeTimers();
    const token = await signSessionToken(payload);
    vi.advanceTimersByTime((SESSION_MAX_AGE_SECONDS + 1) * 1000);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rechaza un payload con estado desconocido", async () => {
    const token = await new SignJWT({ idCliente: "CLI-000001", estado: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setExpirationTime("1h")
      .sign(getAuthSecret());
    expect(await verifySessionToken(token)).toBeNull();
  });
});

describe("cookie de sesión", () => {
  it("es httpOnly, sameSite=lax, 7 días y path /", () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });

  it("secure solo en producción", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it("setSession guarda la cookie y getSession la lee", async () => {
    await setSession(payload);
    expect(jar.get(SESSION_COOKIE)?.options).toMatchObject({ httpOnly: true });
    expect(await getSession()).toEqual(payload);
  });

  it("clearSession vacía la cookie con maxAge 0", async () => {
    await setSession(payload);
    await clearSession();
    expect(jar.get(SESSION_COOKIE)).toMatchObject({ value: "", options: { maxAge: 0 } });
    expect(await getSession()).toBeNull();
  });

  it("getSession devuelve null sin cookie", async () => {
    expect(await getSession()).toBeNull();
  });
});

describe("password", () => {
  it("hashea con bcrypt coste 10 y verifica", async () => {
    const hash = await hashPassword("secreto123");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash).not.toContain("secreto123");
    expect(await verifyPassword("secreto123", hash)).toBe(true);
    expect(await verifyPassword("otra123", hash)).toBe(false);
  });
});
