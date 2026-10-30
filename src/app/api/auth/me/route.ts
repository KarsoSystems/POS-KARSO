import { NextResponse } from "next/server";
import { clearSession, getSession } from "@/server/auth/session";
import { toPublicUser } from "@/server/domain/user";
import { apiError } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

export async function GET() {
  const session = await getSession();
  const user = session && (await userRepository.findById(session.sub));
  if (!user) {
    // Cookie válida pero usuario inexistente (p. ej. se borró data/): se limpia.
    if (session) await clearSession();
    return apiError(401, "NO_AUTENTICADO", "No has iniciado sesión");
  }
  return NextResponse.json({ user: toPublicUser(user) });
}
