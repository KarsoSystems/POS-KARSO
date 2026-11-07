import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import {
  demoCodigo,
  issueWhatsappCode,
  REENVIO_COOLDOWN_MS,
  segundosParaReenviar,
} from "@/server/auth/whatsapp-verification";
import { reenvioPronto } from "@/server/http/verificacion";

export async function POST() {
  const guard = await requireSessionUser("verificacion_pendiente");
  if (guard.response) return guard.response;

  const espera = await segundosParaReenviar(guard.user.id);
  if (espera > 0) return reenvioPronto(espera);

  const codigo = await issueWhatsappCode(guard.user);
  return NextResponse.json({ reenviarEn: REENVIO_COOLDOWN_MS / 1000, ...demoCodigo(codigo) });
}
