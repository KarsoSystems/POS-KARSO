import { apiFetch } from "@/lib/api-client";
import type { UserResponse } from "@/lib/auth-api";
import type { DatosFiscalesInput } from "@/lib/validation/fiscal";
import type { CambioTelefonoInput, ContrasenaInput, DireccionNegocioInput } from "@/lib/validation/perfil";

export type { CambioTelefonoInput, ContrasenaInput, DireccionNegocioInput };

/** Cambio de teléfono en curso: el número nuevo y, fuera de producción, el código (aviso de demo). */
export interface CambioTelefonoResponse {
  whatsappNuevo: string;
  reenviarEn: number;
  demoCodigo?: string;
}

// "Mi perfil" (SPEC 10). Cada tarjeta guarda por separado y la respuesta trae el
// usuario actualizado (como /api/auth/me).
export const perfilApi = {
  guardarDireccion: (input: DireccionNegocioInput) =>
    apiFetch<UserResponse>("/api/perfil/direccion", { method: "PUT", body: input }),

  guardarDatosFiscales: (datosFiscales: DatosFiscalesInput) =>
    apiFetch<UserResponse>("/api/perfil/datos-fiscales", { method: "PUT", body: { datosFiscales } }),

  borrarDatosFiscales: () => apiFetch<UserResponse>("/api/perfil/datos-fiscales", { method: "DELETE" }),

  cambiarContrasena: (input: ContrasenaInput) =>
    apiFetch<UserResponse>("/api/perfil/contrasena", { method: "PUT", body: input }),

  telefonoEnCurso: () => apiFetch<{ whatsappNuevo: string | null }>("/api/perfil/telefono"),

  pedirCambioTelefono: (input: CambioTelefonoInput) =>
    apiFetch<CambioTelefonoResponse>("/api/perfil/telefono", { method: "POST", body: input }),

  verificarTelefono: (codigo: string) =>
    apiFetch<UserResponse>("/api/perfil/telefono/verificar", { method: "POST", body: { codigo } }),

  reenviarCodigoTelefono: () =>
    apiFetch<CambioTelefonoResponse>("/api/perfil/telefono/reenviar", { method: "POST" }),

  cancelarCambioTelefono: () =>
    apiFetch<{ whatsappNuevo: null }>("/api/perfil/telefono", { method: "DELETE" }),
};
