import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import {
  demoCodigo,
  issueWhatsappCode,
  REENVIO_COOLDOWN_MS,
  segundosParaReenviar,
} from "@/server/auth/whatsapp-verification";
import { apiError } from "@/server/http/responses";

export async function POST() {
  const guard = await requireSessionUser("verificacion_pendiente");
  if (guard.response) return guard.response;

  const espera = await segundosParaReenviar(guard.user.id);
  if (espera > 0) {
    const response = apiError(429, "REENVIO_PRONTO", `Espera ${espera} s para pedir otro código.`);
    response.headers.set("Retry-After", String(espera));
    return response;
  }

  const codigo = await issueWhatsappCode(guard.user);
  return NextResponse.json({ reenviarEn: REENVIO_COOLDOWN_MS / 1000, ...demoCodigo(codigo) });
}
