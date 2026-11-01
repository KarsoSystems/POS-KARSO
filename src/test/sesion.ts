// Usuarios activos con sesión para tests de route handlers.
// Requiere vi.mock("next/headers", () => import("@/test/next-headers-mock")).

import { setSession } from "@/server/auth/session";
import type { User } from "@/server/domain/user";
import { userRepository } from "@/server/repositories";
import { jar } from "./next-headers-mock";

/** Crea un usuario activo y deja su cookie de sesión puesta. */
export async function iniciarSesionActiva(correo = "ana@ejemplo.com"): Promise<User> {
  const user = await userRepository.create({
    nombre: "Ana",
    apellidoPaterno: "López",
    apellidoMaterno: "García",
    whatsapp: "+525512345678",
    correo,
    passwordHash: null,
    providers: ["google"],
    whatsappVerificado: true,
    correoVerificado: true,
    estado: "activo",
  });
  await cambiarSesion(user);
  return user;
}

/** Cambia la cookie a la sesión de otro usuario ya creado. */
export async function cambiarSesion(user: User): Promise<void> {
  jar.clear();
  await setSession({ sub: user.id, idCliente: user.idCliente, estado: user.estado });
}
