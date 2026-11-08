import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/server/auth/secreto";

// URL firmada de subida, como la que dará R2 (SPEC 05). En el demo la sirve el
// "R2 local" (src/app/api/r2-local/[...key]/route.ts): la firma autoriza el PUT,
// sin sesión. La firma cubre método, llave, vencimiento y bytes declarados.

export const VIGENCIA_SUBIDA_MS = 15 * 60 * 1000;
export const RUTA_R2_LOCAL = "/api/r2-local/";

function firma(key: string, expira: number, bytes: number): string {
  return createHmac("sha256", getAuthSecret()).update(`PUT\n${key}\n${expira}\n${bytes}`).digest("hex");
}

export interface SubidaFirmada {
  /** Ruta con query, relativa al origen: "/api/r2-local/temporal/<id>.jpg?expira=…&bytes=…&firma=…". */
  ruta: string;
  expiraEn: string; // ISO 8601
}

export function firmarSubida(key: string, bytes: number, ahora: number = Date.now()): SubidaFirmada {
  const expira = ahora + VIGENCIA_SUBIDA_MS;
  const query = new URLSearchParams({ expira: String(expira), bytes: String(bytes), firma: firma(key, expira, bytes) });
  return { ruta: `${RUTA_R2_LOCAL}${key}?${query}`, expiraEn: new Date(expira).toISOString() };
}

/** Los bytes declarados si la firma corresponde a `key` y no ha vencido; si no, null. */
export function verificarSubida(key: string, query: URLSearchParams, ahora: number = Date.now()): { bytes: number } | null {
  const expira = Number(query.get("expira"));
  const bytes = Number(query.get("bytes"));
  const recibida = query.get("firma") ?? "";
  if (!Number.isSafeInteger(expira) || !Number.isSafeInteger(bytes) || bytes < 0) return null;
  if (ahora > expira) return null;

  const esperada = Buffer.from(firma(key, expira, bytes), "hex");
  const dada = Buffer.from(recibida, "hex");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  return { bytes };
}
