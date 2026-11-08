import { NextResponse } from "next/server";
import { completarPerfilSchema } from "@/lib/validation/auth";
import { requireSessionUser } from "@/server/auth/guards";
import { reemitirAcceso } from "@/server/auth/sesiones";
import { demoCodigo, issueWhatsappCode } from "@/server/auth/whatsapp-verification";
import { toPublicUser } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

export async function POST(request: Request) {
  const guard = await requireSessionUser("perfil_incompleto");
  if (guard.response) return guard.response;

  const { data, response } = await parseBody(request, completarPerfilSchema);
  if (response) return response;

  const user = await userRepository.update(guard.user.id, {
    ...data,
    estado: "verificacion_pendiente",
  });
  const codigo = await issueWhatsappCode(user);
  // Mismo sid, token de acceso con el estado nuevo.
  await reemitirAcceso(user, guard.sesion.id);

  return NextResponse.json({ user: toPublicUser(user), ...demoCodigo(codigo) });
}
