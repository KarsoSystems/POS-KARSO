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

const RUTAS_PUBLICAS = ["/login", "/registro"];

const esRuta = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * Tabla de enrutamiento del SPEC 01. Devuelve a dónde redirigir, o null si
 * la petición puede seguir. `estado` es null cuando no hay sesión válida.
 *
 * | Ruta                  | Acceso                                              |
 * | `/`                   | con sesión → su pantalla; sin sesión → /login       |
 * | `/login`, `/registro` | sin sesión; con sesión → su pantalla                |
 * | `/registro/completar` | solo perfil_incompleto                              |
 * | `/registro/verificar` | solo verificacion_pendiente                         |
 * | `/panel/**`           | solo activo                                         |
 */
export function redireccionPara(pathname: string, estado: EstadoCuenta | null): string | null {
  const destino = estado ? rutaParaEstado(estado) : "/login";

  if (pathname === "/") return destino;
  if (RUTAS_PUBLICAS.includes(pathname)) return estado ? destino : null;

  // Rutas que pertenecen a un estado: solo las ve quien está en ese estado.
  for (const [estadoRuta, ruta] of Object.entries(RUTA_POR_ESTADO)) {
    if (esRuta(pathname, ruta)) return estado === estadoRuta ? null : destino;
  }
  return null;
}
