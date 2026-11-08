import { NextResponse } from "next/server";
import { cerrarSesion, sidParaCerrar } from "@/server/auth/sesiones";

/** Revoca la sesión actual (motivo logout) y borra las cookies. */
export async function POST() {
  await cerrarSesion(await sidParaCerrar());
  return NextResponse.json({ ok: true });
}
