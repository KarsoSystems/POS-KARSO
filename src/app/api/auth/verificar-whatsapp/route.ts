import { NextResponse } from "next/server";
import { verificarWhatsappSchema } from "@/lib/validation/auth";
import { requireSessionUser } from "@/server/auth/guards";
import { reemitirAcceso } from "@/server/auth/sesiones";
import { verifyWhatsappCode } from "@/server/auth/whatsapp-verification";
import { toPublicUser } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { errorDeCodigo } from "@/server/http/verificacion";
import { userRepository } from "@/server/repositories";

export async function POST(request: Request) {
  const guard = await requireSessionUser("verificacion_pendiente");
  if (guard.response) return guard.response;

  const { data, response } = await parseBody(request, verificarWhatsappSchema);
  if (response) return response;

  const resultado = await verifyWhatsappCode(guard.user.id, data.codigo);
  if (!resultado.ok) return errorDeCodigo(resultado);

  const user = await userRepository.update(guard.user.id, {
    whatsappVerificado: true,
    estado: "activo",
  });
  // Mismo sid, token de acceso con el estado nuevo.
  await reemitirAcceso(user, guard.sesion.id);
  return NextResponse.json({ user: toPublicUser(user) });
}
