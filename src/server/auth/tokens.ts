import { errors, jwtVerify, SignJWT, type JWTHeaderParameters } from "jose";
import type { EstadoCuenta } from "@/server/domain/user";
import { ALG, llaves } from "./llaves";

// Tokens de la sesión (SPEC 11; KARSO 2.1 a), firmados con RS256 y con `kid`:
// - acceso: 15 min, audiencia "tienda"; lo lee el middleware para enrutar;
// - renovación: 7 días, audiencia "tienda-renovacion" (nunca sirve como acceso),
//   con `jti`; se rota en cada uso y el registro de sesiones guarda el vigente.
// Este módulo también corre en el middleware (edge): nada de node:*.

export const AUDIENCIA_ACCESO = "tienda";
export const AUDIENCIA_RENOVACION = "tienda-renovacion";
export const RENOVACION_SEGUNDOS = 7 * 24 * 60 * 60;
const ACCESO_SEGUNDOS = 15 * 60;

/** 15 min; `AUTH_ACCESO_SEGUNDOS` lo acorta para probar la renovación a mano sin esperar (no en producción). */
export function accesoSegundos(): number {
  const segundos = Number(process.env.AUTH_ACCESO_SEGUNDOS);
  return Number.isInteger(segundos) && segundos > 0 ? segundos : ACCESO_SEGUNDOS;
}

/** `iss`: el origen de la tienda (`AUTH_ISSUER`); por omisión, el de desarrollo. */
export const emisor = () => process.env.AUTH_ISSUER?.trim() || "http://localhost:3000";

const ESTADOS: readonly EstadoCuenta[] = ["perfil_incompleto", "verificacion_pendiente", "activo"];

export interface Acceso {
  sub: string; // User.id
  sid: string; // la sesión (sesiones.json)
  idCliente: string;
  estado: EstadoCuenta; // el middleware enruta con esto sin leer el JSON
}

export interface Renovacion {
  sub: string;
  sid: string;
  jti: string;
}

export type Verificacion<T> = { ok: true; datos: T } | { ok: false; motivo: "vencido" | "invalido" };

async function firmar(claims: Record<string, unknown>, sub: string, audiencia: string, segundos: number, jti?: string) {
  const { kid, privada } = await llaves();
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, kid, typ: "JWT" })
    .setIssuer(emisor())
    .setAudience(audiencia)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${segundos}s`);
  if (jti) jwt.setJti(jti);
  return jwt.sign(privada);
}

async function verificar(token: string | undefined, audiencia: string) {
  if (!token) return { ok: false as const, motivo: "invalido" as const };
  const { publicas } = await llaves();
  try {
    const { payload } = await jwtVerify(
      token,
      // La llave por `kid`: la actual o la anterior. Un kid desconocido no verifica.
      (header: JWTHeaderParameters) => {
        const llave = publicas.find((p) => p.kid === header.kid);
        if (!llave) throw new errors.JWKSNoMatchingKey();
        return llave.llave;
      },
      { algorithms: [ALG], issuer: emisor(), audience: audiencia },
    );
    return { ok: true as const, payload };
  } catch (error) {
    // jose valida `exp` después de la firma: vencido = firma válida, ya pasó su hora.
    return { ok: false as const, motivo: error instanceof errors.JWTExpired ? ("vencido" as const) : ("invalido" as const) };
  }
}

export function firmarAcceso({ sub, sid, idCliente, estado }: Acceso): Promise<string> {
  return firmar({ sid, idCliente, estado }, sub, AUDIENCIA_ACCESO, accesoSegundos());
}

export async function verificarAcceso(token: string | undefined): Promise<Verificacion<Acceso>> {
  const resultado = await verificar(token, AUDIENCIA_ACCESO);
  if (!resultado.ok) return resultado;
  const { sub, sid, idCliente, estado } = resultado.payload;
  if (
    typeof sub !== "string" ||
    typeof sid !== "string" ||
    typeof idCliente !== "string" ||
    !ESTADOS.includes(estado as EstadoCuenta)
  ) {
    return { ok: false, motivo: "invalido" };
  }
  return { ok: true, datos: { sub, sid, idCliente, estado: estado as EstadoCuenta } };
}

export function firmarRenovacion({ sub, sid, jti }: Renovacion): Promise<string> {
  return firmar({ sid }, sub, AUDIENCIA_RENOVACION, RENOVACION_SEGUNDOS, jti);
}

export async function verificarRenovacion(token: string | undefined): Promise<Verificacion<Renovacion>> {
  const resultado = await verificar(token, AUDIENCIA_RENOVACION);
  if (!resultado.ok) return resultado;
  const { sub, sid, jti } = resultado.payload;
  if (typeof sub !== "string" || typeof sid !== "string" || typeof jti !== "string") return { ok: false, motivo: "invalido" };
  return { ok: true, datos: { sub, sid, jti } };
}
