import { NextResponse } from "next/server";
import { cambioTelefonoSchema } from "@/lib/validation/perfil";
import { requireSessionUser } from "@/server/auth/guards";
import {
  demoCodigo,
  issueWhatsappCode,
  REENVIO_COOLDOWN_MS,
  segundosParaReenviar,
} from "@/server/auth/whatsapp-verification";
import { apiError, parseBody } from "@/server/http/responses";
import { reenvioPronto } from "@/server/http/verificacion";
import { cambioEnCurso } from "@/server/perfil/telefono";
import { verificationRepository } from "@/server/repositories";

/** El cambio de teléfono en curso (para retomarlo al recargar): `{ whatsappNuevo }` o `{ whatsappNuevo: null }`. */
export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;
  const cambio = await cambioEnCurso(guard.user);
  return NextResponse.json({ whatsappNuevo: cambio?.whatsapp ?? null });
}

/**
 * Pide cambiar el teléfono (SPEC 10): envía un código al número nuevo. El del
 * usuario no cambia hasta verificarlo. Pedir otro número reemplaza al cambio en
 * curso, con la misma espera de 60 s que el reenvío.
 */
export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, cambioTelefonoSchema);
  if (body.response) return body.response;
  const { whatsapp } = body.data;
  if (whatsapp === guard.user.whatsapp) {
    return apiError(422, "VALIDACION", "Revisa los datos marcados", { whatsapp: "Ese ya es tu número" });
  }

  const espera = await segundosParaReenviar(guard.user.id);
  if (espera > 0) return reenvioPronto(espera);

  const codigo = await issueWhatsappCode(guard.user, whatsapp);
  return NextResponse.json({ whatsappNuevo: whatsapp, reenviarEn: REENVIO_COOLDOWN_MS / 1000, ...demoCodigo(codigo) });
}

/** Cancela el cambio en curso: el teléfono sigue siendo el anterior. */
export async function DELETE() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;
  if (await cambioEnCurso(guard.user)) await verificationRepository.delete(guard.user.id);
  return NextResponse.json({ whatsappNuevo: null });
}
