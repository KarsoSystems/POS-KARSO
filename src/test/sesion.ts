// Usuarios activos con sesión para tests de route handlers.
// Requiere vi.mock("next/headers", () => import("@/test/next-headers-mock")).

import { COOKIE_ACCESO, COOKIE_RENOVACION, iniciarSesion, renovarSesion } from "@/server/auth/sesiones";
import { verificarAcceso } from "@/server/auth/tokens";
import type { User } from "@/server/domain/user";
import { userRepository } from "@/server/repositories";
import { jar } from "./next-headers-mock";

/** Crea un usuario activo y deja sus cookies de sesión puestas. */
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

/** Cambia las cookies a una sesión nueva de otro usuario ya creado. */
export async function cambiarSesion(user: User): Promise<void> {
  jar.clear();
  await iniciarSesion(user, null);
}

/** Los datos del token de acceso de la cookie, o null si no hay uno válido. */
export async function accesoActual() {
  const verificado = await verificarAcceso(jar.get(COOKIE_ACCESO)?.value);
  return verificado.ok ? verificado.datos : null;
}

/**
 * Lo que hace apiFetch ante un TOKEN_EXPIRADO: renovar con la cookie de renovación.
 * Para tests que adelantan el reloj más de 15 min. Sin sesión no hace nada.
 */
export async function renovarSiHaySesion(): Promise<void> {
  if (jar.has(COOKIE_RENOVACION)) await renovarSesion();
}
