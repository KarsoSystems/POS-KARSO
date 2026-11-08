import { NextResponse, type NextRequest } from "next/server";
import { redireccionPara } from "@/lib/auth-routes";
import { verificarAcceso } from "@/server/auth/tokens";

// Enruta según el estado del token de acceso, sin leer el JSON (SPEC 11: RS256 con
// la llave pública). Vencido con firma válida → a renovar, que vuelve a la página;
// ausente o inválido → "sin sesión". El token no se revisa contra sesiones.json
// aquí (edge): lo hacen las rutas de la API, que dan los datos de cada página.
const COOKIE_ACCESO = "acceso";
const COOKIE_VIEJA = "session"; // HS256, antes de la SPEC 11: ya no vale

export async function middleware(request: NextRequest) {
  const acceso = await verificarAcceso(request.cookies.get(COOKIE_ACCESO)?.value);
  const { pathname, search, searchParams } = request.nextUrl;

  if (!acceso.ok && acceso.motivo === "vencido") {
    const renovar = new URL("/api/auth/renovar", request.url);
    renovar.searchParams.set("siguiente", `${pathname}${search}`);
    return sinCookieVieja(request, NextResponse.redirect(renovar));
  }

  const destino = redireccionPara(pathname, acceso.ok ? acceso.datos.estado : null, {
    search,
    siguiente: searchParams.get("siguiente"),
  });
  if (destino) return sinCookieVieja(request, NextResponse.redirect(new URL(destino, request.url)));

  const response = NextResponse.next();
  // Páginas con datos de la sesión: sin caché, para que "atrás" tras cerrar
  // sesión no muestre una copia guardada del panel.
  if (pathname !== "/login" && pathname !== "/registro") {
    response.headers.set("Cache-Control", "no-store");
  }
  return sinCookieVieja(request, response);
}

function sinCookieVieja(request: NextRequest, response: NextResponse) {
  if (request.cookies.has(COOKIE_VIEJA)) response.cookies.delete(COOKIE_VIEJA);
  return response;
}

export const config = {
  matcher: ["/", "/login", "/registro/:path*", "/panel/:path*"],
};
