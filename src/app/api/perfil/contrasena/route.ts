import { NextResponse } from "next/server";
import { contrasenaSchema } from "@/lib/validation/perfil";
import { requireSessionUser } from "@/server/auth/guards";
import { hashPassword } from "@/server/auth/password";
import { toPublicUser } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

/**
 * "Mi perfil" (SPEC 10): cambia la contraseña, o la crea en una cuenta que solo
 * entraba con Google (entonces también entra con correo y contraseña). Por
 * decisión del usuario no se pide la actual: basta la sesión activa. Cerrar las
 * otras sesiones llega con la SPEC 11 (revocación).
 */
export async function PUT(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, contrasenaSchema);
  if (body.response) return body.response;

  const { providers } = guard.user;
  const user = await userRepository.update(guard.user.id, {
    passwordHash: await hashPassword(body.data.password),
    providers: providers.includes("password") ? providers : [...providers, "password"],
  });
  return NextResponse.json({ user: toPublicUser(user) });
}
