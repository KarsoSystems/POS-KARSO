import { NextResponse, type NextRequest } from "next/server";
import { conSiguiente, destinoPara, siguienteSeguro } from "@/lib/auth-routes";
import { borrarCookies, renovarSesion, type FalloRenovacion } from "@/server/auth/sesiones";
import { toPublicUser } from "@/server/domain/user";
import { apiError } from "@/server/http/responses";

// Renovar la sesión (SPEC 11) con el token de renovación, que solo llega a /api/auth.
// Si no se puede, se borran las dos cookies: así el middleware ya no vuelve a mandar aquí.

/** La usa el middleware cuando el token de acceso venció: renueva y vuelve a la página. */
export async function GET(request: NextRequest) {
  const siguiente = request.nextUrl.searchParams.get("siguiente");
  const renovada = await renovarSesion();
  if (!renovada.ok) {
    await borrarCookies();
    return NextResponse.redirect(new URL(conSiguiente("/login", siguienteSeguro(siguiente)), request.url));
  }
  // Solo a /panel/… o a la pantalla del estado de la cuenta, nunca fuera de la tienda.
  return NextResponse.redirect(new URL(destinoPara(renovada.user.estado, siguiente), request.url));
}

const ERRORES: Record<FalloRenovacion, [code: string, message: string]> = {
  sin_sesion: ["NO_AUTENTICADO", "No has iniciado sesión"],
  revocada: ["SESION_REVOCADA", "Tu sesión se cerró"],
  reuso: ["SESION_REVOCADA", "Tu sesión se cerró"],
  vencida: ["SESION_VENCIDA", "Tu sesión venció"],
};

/** La usa apiFetch ante un 401 TOKEN_EXPIRADO. */
export async function POST() {
  const renovada = await renovarSesion();
  if (!renovada.ok) {
    await borrarCookies();
    return apiError(401, ...ERRORES[renovada.motivo]);
  }
  return NextResponse.json({ user: toPublicUser(renovada.user) });
}
