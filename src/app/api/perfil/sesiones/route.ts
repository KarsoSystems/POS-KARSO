import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import { cerrarOtrasSesiones } from "@/server/auth/sesiones";

/** "Cerrar sesión en los demás dispositivos" (SPEC 11): revoca las demás sesiones del usuario. */
export async function DELETE() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;
  return NextResponse.json({ cerradas: await cerrarOtrasSesiones(guard.user.id, guard.sesion.id, "otras_sesiones") });
}
