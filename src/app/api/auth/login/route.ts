import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { iniciarSesion } from "@/server/auth/sesiones";
import { toPublicUser } from "@/server/domain/user";
import { apiError, parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

// Hash de relleno: si el correo no existe se compara igual, para que el tiempo
// de respuesta no delate qué correos están registrados.
const dummyHash = hashPassword("contraseña-de-relleno-0");

const credencialesInvalidas = () =>
  apiError(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");

export async function POST(request: Request) {
  const { data, response } = await parseBody(request, loginSchema);
  if (response) return response;

  const user = await userRepository.findByCorreo(data.correo);
  const ok = await verifyPassword(data.password, user?.passwordHash ?? (await dummyHash));
  // Una cuenta solo de Google no tiene contraseña: mismo mensaje genérico.
  if (!user || !user.passwordHash || !ok) return credencialesInvalidas();

  await iniciarSesion(user, request.headers.get("user-agent"));
  return NextResponse.json({ user: toPublicUser(user) });
}
