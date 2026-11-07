import { NextResponse } from "next/server";
import { verificarWhatsappSchema } from "@/lib/validation/auth";
import { requireSessionUser } from "@/server/auth/guards";
import { verifyWhatsappCode } from "@/server/auth/whatsapp-verification";
import { toPublicUser } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { errorDeCodigo, sinCodigo } from "@/server/http/verificacion";
import { cambioEnCurso } from "@/server/perfil/telefono";
import { userRepository } from "@/server/repositories";

/** Con el código correcto, el número nuevo pasa a ser el teléfono del cliente (verificado). */
export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, verificarWhatsappSchema);
  if (body.response) return body.response;

  // El número se lee antes: un acierto borra la verificación.
  const cambio = await cambioEnCurso(guard.user);
  if (!cambio) return sinCodigo();
  const resultado = await verifyWhatsappCode(guard.user.id, body.data.codigo);
  if (!resultado.ok) return errorDeCodigo(resultado);

  const user = await userRepository.update(guard.user.id, { whatsapp: cambio.whatsapp, whatsappVerificado: true });
  return NextResponse.json({ user: toPublicUser(user) });
}
