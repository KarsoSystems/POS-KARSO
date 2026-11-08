import type { NextResponse } from "next/server";
import { borrarCookies, sesionActual } from "@/server/auth/sesiones";
import type { Sesion } from "@/server/domain/sesion";
import type { EstadoCuenta, User } from "@/server/domain/user";
import { apiError } from "@/server/http/responses";

type Guarded =
  | { user: User; sesion: Sesion; response?: never }
  | { user?: never; sesion?: never; response: NextResponse };

/** El 401 de una petición sin sesión válida (SPEC 11). */
export async function respuestaSinSesion(motivo: "token_expirado" | "revocada" | "vencida" | "sin_sesion", sid?: string) {
  // Acceso vencido: apiFetch renueva y reintenta, así que las cookies se quedan.
  if (motivo === "token_expirado") return apiError(401, "TOKEN_EXPIRADO", "Tu sesión necesita renovarse");
  // Un token que apunta a una sesión que ya no sirve (o a un usuario borrado): se limpian.
  if (motivo === "revocada" || sid) await borrarCookies();
  if (motivo === "revocada") return apiError(401, "SESION_REVOCADA", "Tu sesión se cerró");
  return apiError(401, "NO_AUTENTICADO", "No has iniciado sesión");
}

/**
 * Exige sesión: token de acceso válido, sesión ni revocada ni vencida y usuario
 * existente; opcionalmente, un estado concreto. 401 sin sesión, 409 si el estado
 * no corresponde.
 */
export async function requireSessionUser(estado?: EstadoCuenta): Promise<Guarded> {
  const actual = await sesionActual();
  if (!actual.ok) return { response: await respuestaSinSesion(actual.motivo, actual.sid) };
  if (estado && actual.user.estado !== estado) {
    return {
      response: apiError(409, "ESTADO_INVALIDO", "Esta acción no corresponde al estado de tu cuenta"),
    };
  }
  return { user: actual.user, sesion: actual.sesion };
}
