import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import {
  demoCodigo,
  issueWhatsappCode,
  REENVIO_COOLDOWN_MS,
  segundosParaReenviar,
} from "@/server/auth/whatsapp-verification";
import { reenvioPronto, sinCodigo } from "@/server/http/verificacion";
import { cambioEnCurso } from "@/server/perfil/telefono";

/** Otro código al número nuevo del cambio en curso (cada 60 s). */
export async function POST() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const cambio = await cambioEnCurso(guard.user);
  if (!cambio) return sinCodigo();
  const espera = await segundosParaReenviar(guard.user.id);
  if (espera > 0) return reenvioPronto(espera);

  const codigo = await issueWhatsappCode(guard.user, cambio.whatsapp);
  return NextResponse.json({ whatsappNuevo: cambio.whatsapp, reenviarEn: REENVIO_COOLDOWN_MS / 1000, ...demoCodigo(codigo) });
}
