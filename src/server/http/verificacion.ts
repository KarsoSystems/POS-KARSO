import type { NextResponse } from "next/server";
import type { ResultadoVerificacion } from "@/server/auth/whatsapp-verification";
import { apiError } from "./responses";

// Respuestas comunes del código de WhatsApp: la verificación del registro (SPEC 01)
// y el cambio de teléfono del perfil (SPEC 10).

/** El código falló: 422 con los intentos restantes, o 410 si hay que pedir otro. */
export function errorDeCodigo(resultado: Exclude<ResultadoVerificacion, { ok: true }>): NextResponse {
  switch (resultado.motivo) {
    case "incorrecto":
      return apiError(422, "CODIGO_INCORRECTO", "Código incorrecto", {
        codigo: `Código incorrecto. Te quedan ${resultado.intentosRestantes} intentos.`,
      });
    case "agotado":
      return apiError(410, "CODIGO_AGOTADO", "Demasiados intentos. Solicita un código nuevo.");
    case "expirado":
      return apiError(410, "CODIGO_EXPIRADO", "El código expiró. Solicita uno nuevo.");
    case "sin_codigo":
      return sinCodigo();
  }
}

export const sinCodigo = () => apiError(410, "SIN_CODIGO", "No hay un código vigente. Solicita uno nuevo.");

/** 429 con Retry-After: aún no pasan los 60 s para pedir otro código. */
export function reenvioPronto(espera: number): NextResponse {
  const response = apiError(429, "REENVIO_PRONTO", `Espera ${espera} s para pedir otro código.`);
  response.headers.set("Retry-After", String(espera));
  return response;
}
