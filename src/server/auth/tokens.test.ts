import { createLocalJWKSet, decodeProtectedHeader, importPKCS8, jwtVerify, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as jwksRuta } from "@/app/.well-known/jwks.json/route";
import { generarLlave } from "@/test/llaves";
import { jwks, llaves } from "./llaves";
import {
  AUDIENCIA_ACCESO,
  firmarAcceso,
  firmarRenovacion,
  verificarAcceso,
  verificarRenovacion,
  type Acceso,
} from "./tokens";

const acceso: Acceso = { sub: "user-1", sid: "sesion-1", idCliente: "CLI-000001", estado: "activo" };
const ISSUER = "http://localhost:3000";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("llaves (RS256)", () => {
  it("sin AUTH_PRIVATE_KEY o AUTH_KEY_ID, o con una llave que no es RSA PKCS#8, falla diciendo qué variable", async () => {
    vi.stubEnv("AUTH_PRIVATE_KEY", "");
    await expect(llaves()).rejects.toThrow("AUTH_PRIVATE_KEY debe estar definida");
    vi.unstubAllEnvs();
    vi.stubEnv("AUTH_KEY_ID", "");
    await expect(llaves()).rejects.toThrow("AUTH_KEY_ID debe estar definida");
    vi.unstubAllEnvs();
    vi.stubEnv("AUTH_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\nbasura\n-----END PRIVATE KEY-----");
    await expect(llaves()).rejects.toThrow("AUTH_PRIVATE_KEY debe ser una llave privada RSA en PEM (PKCS#8)");
  });

  it("acepta el PEM en una sola línea con \\n escritos (como lo imprime pnpm generar-llaves)", async () => {
    const llave = generarLlave("una-linea");
    vi.stubEnv("AUTH_PRIVATE_KEY", llave.privada.replace(/\n/g, "\\n"));
    vi.stubEnv("AUTH_KEY_ID", "una-linea");
    expect((await llaves()).kid).toBe("una-linea");
  });

  it("el JWKS publica solo kty, n, e, kid, alg y use; nunca la parte privada", async () => {
    const { keys } = await jwks();
    expect(keys).toHaveLength(1);
    expect(Object.keys(keys[0]).sort()).toEqual(["alg", "e", "kid", "kty", "n", "use"]);
    expect(keys[0]).toMatchObject({ kty: "RSA", kid: process.env.AUTH_KEY_ID, alg: "RS256", use: "sig" });
  });

  it("GET /.well-known/jwks.json responde las llaves sin sesión, con caché corta", async () => {
    const res = await jwksRuta();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    const { keys } = await res.json();
    expect(keys[0]).not.toHaveProperty("d");
  });
});

describe("token de acceso", () => {
  it("lleva alg RS256, kid, iss, aud tienda, sub, sid, idCliente y estado, y vence en 15 min; se verifica solo con el JWKS", async () => {
    const token = await firmarAcceso(acceso);
    expect(decodeProtectedHeader(token)).toEqual({ alg: "RS256", kid: process.env.AUTH_KEY_ID, typ: "JWT" });
    expect(await verificarAcceso(token)).toEqual({ ok: true, datos: acceso });

    // Lo que hará el backend (u otro servicio): verificar con las llaves públicas.
    const { payload } = await jwtVerify(token, createLocalJWKSet(await jwks()), { issuer: ISSUER, audience: AUDIENCIA_ACCESO });
    expect(payload).toMatchObject({ sub: "user-1", sid: "sesion-1", idCliente: "CLI-000001", estado: "activo" });
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
  });

  it("vencido (firma válida) se distingue de inválido", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T18:00:00Z") });
    const token = await firmarAcceso(acceso);
    vi.setSystemTime(new Date("2026-11-07T18:15:01Z"));
    expect(await verificarAcceso(token)).toEqual({ ok: false, motivo: "vencido" });
    expect(await verificarAcceso(`${token.slice(0, -4)}AAAA`)).toEqual({ ok: false, motivo: "invalido" });
    expect(await verificarAcceso(undefined)).toEqual({ ok: false, motivo: "invalido" });
  });

  it("AUTH_ACCESO_SEGUNDOS acorta el acceso (para probar a mano)", async () => {
    vi.stubEnv("AUTH_ACCESO_SEGUNDOS", "5");
    const token = await firmarAcceso(acceso);
    const { payload } = await jwtVerify(token, createLocalJWKSet(await jwks()), { issuer: ISSUER });
    expect(payload.exp! - payload.iat!).toBe(5);
  });

  it("se rechaza: otra llave, un kid desconocido, otra audiencia, otro emisor o HS256", async () => {
    const otra = generarLlave();
    const privadaOtra = await importPKCS8(otra.privada, "RS256");
    const base = () =>
      new SignJWT({ sid: "s", idCliente: "CLI-000001", estado: "activo" })
        .setSubject("user-1")
        .setIssuer(ISSUER)
        .setAudience("tienda")
        .setIssuedAt()
        .setExpirationTime("5m");

    const conOtraLlave = await base().setProtectedHeader({ alg: "RS256", kid: process.env.AUTH_KEY_ID }).sign(privadaOtra);
    const kidDesconocido = await base().setProtectedHeader({ alg: "RS256", kid: "otro" }).sign(privadaOtra);
    const hs256 = await base().setProtectedHeader({ alg: "HS256", kid: process.env.AUTH_KEY_ID }).sign(new TextEncoder().encode("x".repeat(32)));
    const { privada } = await llaves();
    const otraAudiencia = await base().setAudience("admin").setProtectedHeader({ alg: "RS256", kid: process.env.AUTH_KEY_ID }).sign(privada);
    const otroEmisor = await base().setIssuer("https://otro.sitio").setProtectedHeader({ alg: "RS256", kid: process.env.AUTH_KEY_ID }).sign(privada);

    for (const token of [conOtraLlave, kidDesconocido, hs256, otraAudiencia, otroEmisor]) {
      expect(await verificarAcceso(token)).toEqual({ ok: false, motivo: "invalido" });
    }
  });

  it("un token de renovación no sirve como acceso, ni al revés", async () => {
    const renovacion = await firmarRenovacion({ sub: "user-1", sid: "sesion-1", jti: "j1" });
    expect(await verificarAcceso(renovacion)).toEqual({ ok: false, motivo: "invalido" });
    expect(await verificarRenovacion(await firmarAcceso(acceso))).toEqual({ ok: false, motivo: "invalido" });
  });
});

describe("token de renovación", () => {
  it("lleva sid y jti, audiencia tienda-renovacion y vence en 7 días", async () => {
    const token = await firmarRenovacion({ sub: "user-1", sid: "sesion-1", jti: "j1" });
    expect(await verificarRenovacion(token)).toEqual({ ok: true, datos: { sub: "user-1", sid: "sesion-1", jti: "j1" } });
    const { payload } = await jwtVerify(token, createLocalJWKSet(await jwks()), { issuer: ISSUER, audience: "tienda-renovacion" });
    expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60);
  });
});

describe("rotación de llaves por kid", () => {
  it("con la llave anterior configurada, el JWKS publica las dos y un token firmado con la anterior sigue verificando", async () => {
    // Antes de rotar: tokens firmados con la llave "vieja".
    const vieja = generarLlave("vieja");
    vi.stubEnv("AUTH_PRIVATE_KEY", vieja.privada);
    vi.stubEnv("AUTH_KEY_ID", "vieja");
    const tokenViejo = await firmarAcceso(acceso);

    // Rotación: la nueva firma y la vieja solo verifica.
    const nueva = generarLlave("nueva");
    vi.stubEnv("AUTH_PRIVATE_KEY", nueva.privada);
    vi.stubEnv("AUTH_KEY_ID", "nueva");
    vi.stubEnv("AUTH_PUBLIC_KEY_ANTERIOR", vieja.publica);
    vi.stubEnv("AUTH_KEY_ID_ANTERIOR", "vieja");

    expect((await jwks()).keys.map((k) => k.kid)).toEqual(["nueva", "vieja"]);
    expect(await verificarAcceso(tokenViejo)).toEqual({ ok: true, datos: acceso });
    expect(decodeProtectedHeader(await firmarAcceso(acceso)).kid).toBe("nueva");

    // Al quitar la anterior, sus tokens dejan de valer.
    vi.stubEnv("AUTH_PUBLIC_KEY_ANTERIOR", "");
    vi.stubEnv("AUTH_KEY_ID_ANTERIOR", "");
    expect(await verificarAcceso(tokenViejo)).toEqual({ ok: false, motivo: "invalido" });
  });

  it("la llave anterior necesita su kid, distinto del actual", async () => {
    vi.stubEnv("AUTH_PUBLIC_KEY_ANTERIOR", generarLlave().publica);
    await expect(llaves()).rejects.toThrow("AUTH_KEY_ID_ANTERIOR debe acompañar a AUTH_PUBLIC_KEY_ANTERIOR");
    vi.stubEnv("AUTH_KEY_ID_ANTERIOR", process.env.AUTH_KEY_ID!);
    await expect(llaves()).rejects.toThrow("AUTH_KEY_ID_ANTERIOR debe ser distinto de AUTH_KEY_ID");
  });
});
