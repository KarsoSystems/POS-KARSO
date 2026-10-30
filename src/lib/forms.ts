import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "@/lib/api-client";

/**
 * Lleva un error de la API al formulario: los `fields` conocidos van a su
 * campo; lo demás se muestra como error general (`root.server`).
 */
export function applyApiError<T extends FieldValues>(
  form: UseFormReturn<T, unknown, FieldValues>,
  error: unknown,
): void {
  if (!(error instanceof ApiError)) {
    form.setError("root.server", { message: "Ocurrió un error inesperado" });
    return;
  }

  const campos = Object.keys(form.getValues());
  const conocidos = Object.entries(error.fields).filter(([campo]) => campos.includes(campo));
  for (const [campo, message] of conocidos) {
    form.setError(campo as Path<T>, { message }, { shouldFocus: true });
  }
  if (conocidos.length === 0) form.setError("root.server", { message: error.message });
}
