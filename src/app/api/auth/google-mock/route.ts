import { NextResponse } from "next/server";
import { googleMockSchema } from "@/lib/validation/auth";
import { iniciarSesion } from "@/server/auth/sesiones";
import { toPublicUser, type User } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

// Simulación de "Continuar con Google": no hay OAuth, se confía en el
// nombre y correo que se escriben en el modal (solo para el demo).
export async function POST(request: Request) {
  const { data, response } = await parseBody(request, googleMockSchema);
  if (response) return response;

  const existente = await userRepository.findByCorreo(data.correo);
  let user: User;
  let status = 200;

  if (existente) {
    // Misma cuenta (mismo idCliente): se vincula Google si aún no lo estaba.
    user = existente.providers.includes("google")
      ? existente
      : await userRepository.update(existente.id, {
          providers: [...existente.providers, "google"],
          correoVerificado: true,
        });
  } else {
    user = await userRepository.create({
      nombre: data.nombre,
      apellidoPaterno: null,
      apellidoMaterno: null,
      whatsapp: null,
      correo: data.correo,
      passwordHash: null,
      providers: ["google"],
      whatsappVerificado: false,
      correoVerificado: true,
      estado: "perfil_incompleto",
    });
    status = 201;
  }

  await iniciarSesion(user, request.headers.get("user-agent"));
  return NextResponse.json({ user: toPublicUser(user) }, { status });
}
