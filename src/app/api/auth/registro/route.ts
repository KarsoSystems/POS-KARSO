import { NextResponse } from "next/server";
import { registroSchema } from "@/lib/validation/auth";
import { hashPassword } from "@/server/auth/password";
import { iniciarSesion } from "@/server/auth/sesiones";
import { demoCodigo, issueWhatsappCode } from "@/server/auth/whatsapp-verification";
import { toPublicUser } from "@/server/domain/user";
import { apiError, parseBody } from "@/server/http/responses";
import { CorreoDuplicadoError, userRepository } from "@/server/repositories";

export async function POST(request: Request) {
  const { data, response } = await parseBody(request, registroSchema);
  if (response) return response;

  const { password, ...datos } = data;
  let user;
  try {
    user = await userRepository.create({
      ...datos,
      passwordHash: await hashPassword(password),
      providers: ["password"],
      whatsappVerificado: false,
      correoVerificado: false,
      estado: "verificacion_pendiente",
    });
  } catch (error) {
    if (error instanceof CorreoDuplicadoError) {
      return apiError(409, "CORREO_DUPLICADO", "Este correo ya está registrado", {
        correo: "Este correo ya está registrado",
      });
    }
    throw error;
  }

  const codigo = await issueWhatsappCode(user);
  await iniciarSesion(user, request.headers.get("user-agent"));

  return NextResponse.json({ user: toPublicUser(user), ...demoCodigo(codigo) }, { status: 201 });
}
