import { NextResponse, type NextRequest } from "next/server";
import { redireccionPara } from "@/lib/auth-routes";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";

// Enruta según el estado guardado en el JWT, sin leer el JSON.
// Una cookie inválida o expirada cuenta como "sin sesión".
export async function middleware(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search, searchParams } = request.nextUrl;

  const destino = redireccionPara(pathname, session?.estado ?? null, {
    search,
    siguiente: searchParams.get("siguiente"),
  });
  if (destino) return NextResponse.redirect(new URL(destino, request.url));

  const response = NextResponse.next();
  // Páginas con datos de la sesión: sin caché, para que "atrás" tras cerrar
  // sesión no muestre una copia guardada del panel.
  if (pathname !== "/login" && pathname !== "/registro") {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: ["/", "/login", "/registro/:path*", "/panel/:path*"],
};
