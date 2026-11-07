import type { EstadoCuenta } from "@/server/domain/user";

// Pantalla a la que pertenece cada estado de cuenta. La usan los formularios
// después de autenticar y el middleware (runtime edge: sin imports de node).
export const RUTA_POR_ESTADO: Record<EstadoCuenta, string> = {
  perfil_incompleto: "/registro/completar",
  verificacion_pendiente: "/registro/verificar",
  activo: "/panel",
};

export function rutaParaEstado(estado: EstadoCuenta): string {
  return RUTA_POR_ESTADO[estado];
}

/**
 * La ruta a la que volver después del login (SPEC 08), solo si es interna del
 * panel: "/panel/…". Cualquier otra ("https://…", "//otro.sitio", "/login") es
 * null, para que nadie arme un enlace de login que redirija fuera de la tienda.
 */
export function siguienteSeguro(ruta: string | null | undefined): string | null {
  if (!ruta || !ruta.startsWith("/panel/") || /[\\\s]/.test(ruta)) return null;
  return ruta;
}

/** "/login" + "?siguiente=/panel/…" si hay a dónde volver. */
export function conSiguiente(ruta: string, siguiente: string | null): string {
  return siguiente ? `${ruta}?siguiente=${encodeURIComponent(siguiente)}` : ruta;
}

/**
 * A dónde llevar a la cuenta después de autenticar: con la cuenta activa, a
 * `siguiente` (o al inicio del panel); si aún le falta completar el perfil o
 * verificar el WhatsApp, a esa pantalla, conservando `siguiente` para el final.
 */
export function destinoPara(estado: EstadoCuenta, siguiente: string | null = null): string {
  const seguro = siguienteSeguro(siguiente);
  return estado === "activo" ? (seguro ?? RUTA_POR_ESTADO.activo) : conSiguiente(RUTA_POR_ESTADO[estado], seguro);
}

const RUTAS_PUBLICAS = ["/login", "/registro"];

const esRuta = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * Tabla de enrutamiento del SPEC 01. Devuelve a dónde redirigir, o null si
 * la petición puede seguir. `estado` es null cuando no hay sesión válida.
 *
 * Desde la SPEC 08, quien abre una página del panel sin poder verla (p. ej. el QR
 * del pedido sin sesión) va a `/login?siguiente=<esa página>`, y la ruta se
 * conserva por registro, perfil y verificación hasta llegar a ella.
 *
 * | Ruta                  | Acceso                                              |
 * | `/`                   | con sesión → su pantalla; sin sesión → /login       |
 * | `/login`, `/registro` | sin sesión; con sesión → su pantalla                |
 * | `/registro/completar` | solo perfil_incompleto                              |
 * | `/registro/verificar` | solo verificacion_pendiente                         |
 * | `/panel/**`           | solo activo                                         |
 */
export function redireccionPara(
  pathname: string,
  estado: EstadoCuenta | null,
  { search = "", siguiente = null }: { search?: string; siguiente?: string | null } = {},
): string | null {
  // La página del panel que se quería ver, o la que ya venía en ?siguiente=.
  const volverA = siguienteSeguro(`${pathname}${search}`) ?? siguienteSeguro(siguiente);
  const destino = estado ? destinoPara(estado, volverA) : conSiguiente("/login", volverA);

  if (pathname === "/") return estado ? rutaParaEstado(estado) : "/login";
  if (RUTAS_PUBLICAS.includes(pathname)) return estado ? destino : null;

  // Rutas que pertenecen a un estado: solo las ve quien está en ese estado.
  for (const [estadoRuta, ruta] of Object.entries(RUTA_POR_ESTADO)) {
    if (esRuta(pathname, ruta)) return estado === estadoRuta ? null : destino;
  }
  return null;
}
