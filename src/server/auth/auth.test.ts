import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { getAuthSecret } from "./secreto";

// La sesión (tokens RS256, cookies y sesiones.json) se prueba en tokens.test.ts y
// sesiones.test.ts; aquí quedan el secreto de las URLs de subida y las contraseñas.

const SECRET = "x".repeat(32);

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("password", () => {
  it("hashea con bcrypt coste 10 y verifica", async () => {
    const hash = await hashPassword("secreto123");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash).not.toContain("secreto123");
    expect(await verifyPassword("secreto123", hash)).toBe(true);
    expect(await verifyPassword("otra123", hash)).toBe(false);
  });
});
