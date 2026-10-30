import { NextResponse } from "next/server";
import { verificarWhatsappSchema } from "@/lib/validation/auth";
import { requireSessionUser } from "@/server/auth/guards";
import { setSession } from "@/server/auth/session";
import { verifyWhatsappCode } from "@/server/auth/whatsapp-verification";
import { toPublicUser } from "@/server/domain/user";
import { apiError, parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

export async function POST(request: Request) {
  const guard = await requireSessionUser("verificacion_pendiente");
  if (guard.response) return guard.response;

  const { data, response } = await parseBody(request, verificarWhatsappSchema);
  if (response) return response;

  const resultado = await verifyWhatsappCode(guard.user.id, data.codigo);
  if (!resultado.ok) {
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
        return apiError(410, "SIN_CODIGO", "No hay un código vigente. Solicita uno nuevo.");
    }
  }

  const user = await userRepository.update(guard.user.id, {
    whatsappVerificado: true,
    estado: "activo",
  });
  await setSession({ sub: user.id, idCliente: user.idCliente, estado: user.estado });
  return NextResponse.json({ user: toPublicUser(user) });
}
