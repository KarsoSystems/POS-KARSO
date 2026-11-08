import { NextResponse } from "next/server";
import { contrasenaSchema } from "@/lib/validation/perfil";
import { requireSessionUser } from "@/server/auth/guards";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { cerrarOtrasSesiones } from "@/server/auth/sesiones";
import { toPublicUser } from "@/server/domain/user";
import { apiError, parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

/**
 * "Mi perfil" (SPEC 10): cambia la contraseña, o la crea en una cuenta que solo
 * entraba con Google (entonces también entra con correo y contraseña). Desde la
 * SPEC 11 pide la actual si la cuenta ya tiene una, y cierra las demás sesiones
 * del usuario (la actual sigue).
 */
export async function PUT(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, contrasenaSchema);
  if (body.response) return body.response;

  const { passwordHash, providers } = guard.user;
  if (passwordHash) {
    const actual = body.data.contrasenaActual ?? "";
    if (!actual) {
      return apiError(422, "VALIDACION", "Revisa los datos marcados", { contrasenaActual: "Escribe tu contraseña actual" });
    }
    if (!(await verifyPassword(actual, passwordHash))) {
      return apiError(422, "CONTRASENA_INCORRECTA", "La contraseña actual no es correcta", {
        contrasenaActual: "La contraseña actual no es correcta",
      });
    }
  }

  const user = await userRepository.update(guard.user.id, {
    passwordHash: await hashPassword(body.data.password),
    providers: providers.includes("password") ? providers : [...providers, "password"],
  });
  const sesionesCerradas = await cerrarOtrasSesiones(user.id, guard.sesion.id, "cambio_contrasena");
  return NextResponse.json({ user: toPublicUser(user), sesionesCerradas });
}
