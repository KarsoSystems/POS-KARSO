import type { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/server/auth/session";
import type { EstadoCuenta, User } from "@/server/domain/user";
import { apiError } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

type Guarded =
  | { user: User; session: SessionPayload; response?: never }
  | { user?: never; session?: never; response: NextResponse };

/**
 * Exige sesión con un usuario existente y, opcionalmente, un estado concreto.
 * Devuelve 401 sin sesión y 409 si el estado no corresponde.
 */
export async function requireSessionUser(estado?: EstadoCuenta): Promise<Guarded> {
  const session = await getSession();
  const user = session && (await userRepository.findById(session.sub));
  if (!session || !user) {
    return { response: apiError(401, "NO_AUTENTICADO", "No has iniciado sesión") };
  }
  if (estado && user.estado !== estado) {
    return {
      response: apiError(409, "ESTADO_INVALIDO", "Esta acción no corresponde al estado de tu cuenta"),
    };
  }
  return { user, session };
}
