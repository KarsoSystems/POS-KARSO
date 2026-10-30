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
  body?: unknown;
}

export async function apiFetch<T>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "RED", "No se pudo conectar con el servidor");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;
    throw new ApiError(
      response.status,
      error?.code ?? "DESCONOCIDO",
      error?.message ?? "Ocurrió un error inesperado",
      error?.fields,
      retryAfter,
    );
  }
  return data as T;
}
