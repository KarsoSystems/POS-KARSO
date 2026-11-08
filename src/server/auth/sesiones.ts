import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { MotivoRevocacion, Sesion } from "@/server/domain/sesion";
import type { User } from "@/server/domain/user";
import { sesionRepository, userRepository } from "@/server/repositories";
import {
  firmarAcceso,
  firmarRenovacion,
  RENOVACION_SEGUNDOS,
  verificarAcceso,
  verificarRenovacion,
  type Acceso,
} from "./tokens";

// Sesiones de la tienda (SPEC 11; KARSO 2.1 a). Cada inicio de sesión crea una en
// sesiones.json y pone dos cookies httpOnly:
// - `acceso`: el token de 15 min. La cookie dura lo mismo que la sesión, para que
//   el middleware distinga "vencido" (renovar) de "sin sesión".
// - `renovacion`: el de 7 días, solo para /api/auth (renovar y cerrar sesión).
// Renovar rota el `jti`; uno ya rotado revoca la sesión (reúso = robo), salvo el
// anterior durante 10 s, por dos pestañas que renuevan a la vez. Solo Node.

export const COOKIE_ACCESO = "acceso";
export const COOKIE_RENOVACION = "renovacion";
export const PATH_RENOVACION = "/api/auth";
const GRACIA_MS = 10_000;
const AGENTE_MAX = 200;

const segura = () => process.env.NODE_ENV === "production";

export const opcionesAcceso = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: segura(),
  path: "/",
  maxAge: RENOVACION_SEGUNDOS,
});

export const opcionesRenovacion = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: segura(),
  path: PATH_RENOVACION,
  maxAge: RENOVACION_SEGUNDOS,
});

const accesoDe = (user: User, sid: string): Acceso => ({ sub: user.id, sid, idCliente: user.idCliente, estado: user.estado });
const masSieteDias = (ahora: Date) => new Date(ahora.getTime() + RENOVACION_SEGUNDOS * 1000).toISOString();

async function ponerCookies(user: User, sesion: Sesion): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_ACCESO, await firmarAcceso(accesoDe(user, sesion.id)), opcionesAcceso());
  jar.set(
    COOKIE_RENOVACION,
    await firmarRenovacion({ sub: user.id, sid: sesion.id, jti: sesion.jtiVigente }),
    opcionesRenovacion(),
  );
}

/** Borra las dos cookies (y la `session` HS256 de antes de la SPEC 11). */
export async function borrarCookies(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_ACCESO, "", { ...opcionesAcceso(), maxAge: 0 });
  jar.set(COOKIE_RENOVACION, "", { ...opcionesRenovacion(), maxAge: 0 });
  jar.set("session", "", { ...opcionesAcceso(), maxAge: 0 });
}

/** Login, Google o registro: crea la sesión y pone las cookies. */
export async function iniciarSesion(user: User, agente: string | null, ahora: Date = new Date()): Promise<Sesion> {
  const fecha = ahora.toISOString();
  const sesion = await sesionRepository.create({
    id: randomUUID(),
    userId: user.id,
    jtiVigente: randomUUID(),
    jtiAnterior: null,
    agente: (agente ?? "").slice(0, AGENTE_MAX),
    creadaEn: fecha,
    renovadaEn: fecha,
    expiraEn: masSieteDias(ahora),
    revocadaEn: null,
    motivoRevocacion: null,
  });
  await ponerCookies(user, sesion);
  return sesion;
}

/** Un cambio de estado de la cuenta (completar perfil, verificar WhatsApp): token de acceso nuevo, misma sesión. */
export async function reemitirAcceso(user: User, sid: string): Promise<void> {
  (await cookies()).set(COOKIE_ACCESO, await firmarAcceso(accesoDe(user, sid)), opcionesAcceso());
}

export type FalloRenovacion = "sin_sesion" | "revocada" | "vencida" | "reuso";

/**
 * Renueva con el token de renovación de la cookie: rota el `jti`, extiende 7 días y
 * pone cookies nuevas. Un `jti` que ya no es el vigente (ni el anterior dentro de
 * los 10 s de gracia) revoca la sesión.
 */
export async function renovarSesion(
  ahora: Date = new Date(),
): Promise<{ ok: true; user: User; sesion: Sesion } | { ok: false; motivo: FalloRenovacion }> {
  const token = (await cookies()).get(COOKIE_RENOVACION)?.value;
  const verificado = await verificarRenovacion(token);
  if (!verificado.ok) return { ok: false, motivo: verificado.motivo === "vencido" ? "vencida" : "sin_sesion" };
  const { sub, sid, jti } = verificado.datos;

  /** Qué impide renovar esta sesión con este token, o null si se puede. */
  const impedimento = (s: Sesion): FalloRenovacion | null => {
    if (s.userId !== sub) return "sin_sesion";
    if (s.revocadaEn) return "revocada";
    if (Date.parse(s.expiraEn) <= ahora.getTime()) return "vencida";
    return null;
  };

  let motivo: FalloRenovacion | null = null;
  const sesion = await sesionRepository.update(sid, (s) => {
    motivo = impedimento(s);
    if (motivo) return;
    if (jti === s.jtiVigente) {
      s.jtiAnterior = s.jtiVigente;
      s.jtiVigente = randomUUID();
      s.renovadaEn = ahora.toISOString();
      s.expiraEn = masSieteDias(ahora);
      return;
    }
    // Otra pestaña acaba de rotar: este navegador recibe el token vigente, sin rotar otra vez.
    const enGracia = jti === s.jtiAnterior && ahora.getTime() - Date.parse(s.renovadaEn) <= GRACIA_MS;
    if (enGracia) return;
    s.revocadaEn = ahora.toISOString();
    s.motivoRevocacion = "reuso";
    motivo = "reuso";
  });
  if (!sesion) return { ok: false, motivo: "sin_sesion" };
  if (motivo) return { ok: false, motivo };

  const user = await userRepository.findById(sesion.userId);
  if (!user) return { ok: false, motivo: "sin_sesion" };
  await ponerCookies(user, sesion);
  return { ok: true, user, sesion };
}

/**
 * La sesión a cerrar en `/api/auth/logout`: la del token de renovación, que llega a
 * /api/auth y dura lo que la sesión; si no, la del de acceso vigente.
 */
export async function sidParaCerrar(): Promise<string | null> {
  const jar = await cookies();
  const renovacion = await verificarRenovacion(jar.get(COOKIE_RENOVACION)?.value);
  if (renovacion.ok) return renovacion.datos.sid;
  const acceso = await verificarAcceso(jar.get(COOKIE_ACCESO)?.value);
  return acceso.ok ? acceso.datos.sid : null;
}

/** "Cerrar sesión": revoca la sesión y borra las cookies. */
export async function cerrarSesion(sid: string | null, ahora: Date = new Date()): Promise<void> {
  if (sid) {
    await sesionRepository.update(sid, (s) => {
      if (s.revocadaEn) return;
      s.revocadaEn = ahora.toISOString();
      s.motivoRevocacion = "logout";
    });
  }
  await borrarCookies();
}

/** Revoca las demás sesiones del usuario (cambio de contraseña, "los demás dispositivos"); devuelve cuántas. */
export function cerrarOtrasSesiones(userId: string, sidActual: string, motivo: MotivoRevocacion, ahora: Date = new Date()) {
  return sesionRepository.revocarDelUsuario(userId, { excepto: sidActual, motivo, ahora });
}

export type SinSesion = "token_expirado" | "revocada" | "vencida" | "sin_sesion";

/**
 * La sesión de la petición: token de acceso válido, sesión ni revocada ni vencida
 * y usuario existente. Lo usan las rutas de la API (el middleware solo lee el token).
 */
export async function sesionActual(
  ahora: Date = new Date(),
): Promise<{ ok: true; user: User; sesion: Sesion } | { ok: false; motivo: SinSesion; sid?: string }> {
  const verificado = await verificarAcceso((await cookies()).get(COOKIE_ACCESO)?.value);
  if (!verificado.ok) return { ok: false, motivo: verificado.motivo === "vencido" ? "token_expirado" : "sin_sesion" };
  const { sub, sid } = verificado.datos;

  const sesion = await sesionRepository.findById(sid);
  if (!sesion || sesion.userId !== sub) return { ok: false, motivo: "sin_sesion", sid };
  if (sesion.revocadaEn) return { ok: false, motivo: "revocada", sid };
  if (Date.parse(sesion.expiraEn) <= ahora.getTime()) return { ok: false, motivo: "vencida", sid };

  const user = await userRepository.findById(sub);
  if (!user) return { ok: false, motivo: "sin_sesion", sid };
  return { ok: true, user, sesion };
}
