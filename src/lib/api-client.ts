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

export async function apiFetch<T>(path: string, { method = "GET", body, signal }: RequestOptions = {}): Promise<T> {
  const esFormData = typeof FormData !== "undefined" && body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
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

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;
    throw apiErrorFrom(response.status, data, retryAfter);
  }
  return data as T;
}
