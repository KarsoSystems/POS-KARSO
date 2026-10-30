import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import type { EstadoCuenta } from "@/server/domain/user";

// Este módulo también lo usa el middleware (runtime edge):
// no importar nada de node:* aquí.

export interface SessionPayload {
  sub: string; // User.id
  idCliente: string;
  estado: EstadoCuenta; // el middleware enruta con esto sin leer el JSON
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días
export const AUTH_SECRET_MIN_LENGTH = 32;

const ESTADOS: readonly EstadoCuenta[] = ["perfil_incompleto", "verificacion_pendiente", "activo"];

/** Lanza si AUTH_SECRET falta o tiene menos de 32 caracteres. */
export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `AUTH_SECRET debe estar definida y tener al menos ${AUTH_SECRET_MIN_LENGTH} caracteres`,
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ idCliente: payload.idCliente, estado: payload.estado })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getAuthSecret());
}

/** Devuelve el payload, o null si el token es inválido, expiró o tiene forma inesperada. */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ["HS256"] });
    const { sub, idCliente, estado } = payload;
    if (
      typeof sub !== "string" ||
      typeof idCliente !== "string" ||
      !ESTADOS.includes(estado as EstadoCuenta)
    ) {
      return null;
    }
    return { sub, idCliente, estado: estado as EstadoCuenta };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

// Helpers para route handlers y server components.

export async function setSession(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
