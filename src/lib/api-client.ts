// Cliente HTTP del front. Es la única vía del front hacia el backend:
// en el demo son los route handlers de Next (mismo origen); en
// preproducción basta con definir NEXT_PUBLIC_API_BASE_URL.

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 = no hubo respuesta (red)
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly retryAfter?: number, // segundos, del header Retry-After (p. ej. en 429)
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Objeto (se manda como JSON) o FormData (el navegador pone el content-type con boundary). */
  body?: unknown;
  /** Cancela la petición: rechaza con ApiError CANCELADO. */
  signal?: AbortSignal;
}

/** Convierte una respuesta de error `{ error }` de la API en ApiError. */
export function apiErrorFrom(status: number, data: unknown, retryAfter?: number): ApiError {
  const error = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } })
    ?.error;
  return new ApiError(
    status,
    error?.code ?? "DESCONOCIDO",
    error?.message ?? "Ocurrió un error inesperado",
    error?.fields,
    retryAfter,
  );
}

const RUTA_RENOVAR = "/api/auth/renovar";

/** fetch a la API con las cookies; un fallo de red o una cancelación da ApiError. */
async function pedir(path: string, { method = "GET", body, signal }: RequestOptions): Promise<Response> {
  const esFormData = typeof FormData !== "undefined" && body instanceof FormData;
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined || esFormData ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : esFormData ? body : JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal?.aborted) throw new ApiError(0, "CANCELADO", "Petición cancelada");
    throw new ApiError(0, "RED", "No se pudo conectar con el servidor");
  }
}

async function errorDe(response: Response): Promise<ApiError> {
  const data = await response.json().catch(() => null);
  const retryAfter = Number(response.headers.get("retry-after")) || undefined;
  return apiErrorFrom(response.status, data, retryAfter);
}

// La renovación en curso: las peticiones que reciben TOKEN_EXPIRADO a la vez esperan
// la misma, para no rotar el token de renovación dos veces (SPEC 11).
let renovacionEnCurso: Promise<ApiError | null> | null = null;

/** POST /api/auth/renovar una sola vez por tanda: null si renovó, o el error. */
function renovarSesion(): Promise<ApiError | null> {
  renovacionEnCurso ??= pedir(RUTA_RENOVAR, { method: "POST" })
    .then((response) => (response.ok ? null : errorDe(response)))
    .catch((error: ApiError) => error)
    .finally(() => {
      renovacionEnCurso = null;
    });
  return renovacionEnCurso;
}

/**
 * Petición a la API. Ante un 401 TOKEN_EXPIRADO (el token de acceso de 15 min
 * venció), renueva la sesión una vez y repite la petición; si no se puede renovar,
 * llega ese 401 (las pantallas ya mandan a /login).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await pedir(path, options);
  if (response.status === 401 && path !== RUTA_RENOVAR) {
    const error = await errorDe(response.clone());
    if (error.code === "TOKEN_EXPIRADO") {
      const fallo = await renovarSesion();
      if (fallo) throw fallo;
      response = await pedir(path, options);
    }
  }

  if (!response.ok) throw await errorDe(response);
  return (await response.json().catch(() => null)) as T;
}
