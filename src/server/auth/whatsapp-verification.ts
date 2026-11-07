import { randomInt, timingSafeEqual } from "node:crypto";
import type { User } from "@/server/domain/user";
import { verificationRepository } from "@/server/repositories";

export const CODIGO_VIGENCIA_MS = 10 * 60 * 1000; // 10 min
export const MAX_INTENTOS = 5;
export const REENVIO_COOLDOWN_MS = 60 * 1000; // 60 s

/**
 * Genera y guarda un código nuevo de 6 dígitos para el usuario y lo "envía"
 * a la consola del servidor. Devuelve el código (para el aviso de demo).
 * `whatsapp` es el número al que se envía: el del usuario (registro) o uno nuevo
 * que quiere poner en su perfil (SPEC 10).
 */
export async function issueWhatsappCode(user: User, whatsapp: string = user.whatsapp ?? ""): Promise<string> {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  await verificationRepository.upsert({
    userId: user.id,
    whatsapp,
    codigo,
    expiresAt: new Date(now + CODIGO_VIGENCIA_MS).toISOString(),
    intentos: 0,
    ultimoEnvio: new Date(now).toISOString(),
  });
  console.log(`[DEMO WHATSAPP] Código para ${whatsapp} (${user.idCliente}): ${codigo}`);
  return codigo;
}

/** El código solo viaja en la respuesta fuera de producción. */
export function demoCodigo(codigo: string): { demoCodigo?: string } {
  return process.env.NODE_ENV === "production" ? {} : { demoCodigo: codigo };
}

/** Segundos que faltan para poder reenviar (0 = ya se puede). */
export async function segundosParaReenviar(userId: string): Promise<number> {
  const verification = await verificationRepository.findByUserId(userId);
  if (!verification) return 0;
  const restante = Date.parse(verification.ultimoEnvio) + REENVIO_COOLDOWN_MS - Date.now();
  return Math.max(0, Math.ceil(restante / 1000));
}

export type ResultadoVerificacion =
  | { ok: true }
  | { ok: false; motivo: "sin_codigo" | "expirado" | "agotado" }
  | { ok: false; motivo: "incorrecto"; intentosRestantes: number };

/**
 * Compara el código. Un fallo suma un intento; al 5.º fallo el código se
 * invalida. Un acierto borra la verificación.
 */
export async function verifyWhatsappCode(userId: string, codigo: string): Promise<ResultadoVerificacion> {
  const verification = await verificationRepository.findByUserId(userId);
  if (!verification) return { ok: false, motivo: "sin_codigo" };
  if (Date.parse(verification.expiresAt) <= Date.now()) return { ok: false, motivo: "expirado" };
  if (verification.intentos >= MAX_INTENTOS) return { ok: false, motivo: "agotado" };

  if (timingSafeEqual(Buffer.from(codigo), Buffer.from(verification.codigo))) {
    await verificationRepository.delete(userId);
    return { ok: true };
  }

  const intentos = verification.intentos + 1;
  if (intentos >= MAX_INTENTOS) {
    await verificationRepository.delete(userId);
    return { ok: false, motivo: "agotado" };
  }
  await verificationRepository.upsert({ ...verification, intentos });
  return { ok: false, motivo: "incorrecto", intentosRestantes: MAX_INTENTOS - intentos };
}
