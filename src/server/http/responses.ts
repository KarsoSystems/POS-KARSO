import { NextResponse } from "next/server";
import type { z } from "zod";

// Forma única de error de la API: { error: { code, message, fields? } }.
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...(fields && { fields }) } },
    { status },
  );
}

/** Primer mensaje de error por campo. */
function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join(".") || "_";
    fields[campo] ??= issue.message;
  }
  return fields;
}

/**
 * Lee el body JSON y lo valida. Devuelve `{ data }` o `{ response }` con el error
 * listo para devolver (400 si no es JSON, 422 si no pasa la validación).
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S>; response?: never } | { data?: never; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: apiError(400, "JSON_INVALIDO", "El cuerpo de la petición no es JSON válido") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      response: apiError(422, "VALIDACION", "Revisa los datos marcados", zodFields(result.error)),
    };
  }
  return { data: result.data };
}
