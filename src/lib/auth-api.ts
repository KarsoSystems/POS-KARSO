import { apiFetch } from "@/lib/api-client";
import type {
  CompletarPerfilInput,
  GoogleMockInput,
  LoginInput,
  RegistroInput,
  VerificarWhatsappInput,
} from "@/lib/validation/auth";
// Solo tipos: se borran al compilar, no arrastran código del servidor al front.
import type { PublicUser } from "@/server/domain/user";

export type { PublicUser };

export interface UserResponse {
  user: PublicUser;
}

/** `demoCodigo` solo llega fuera de producción (aviso de demo). */
export interface CodigoEnviadoResponse {
  demoCodigo?: string;
}

export const authApi = {
  registro: (input: RegistroInput) =>
    apiFetch<UserResponse & CodigoEnviadoResponse>("/api/auth/registro", { method: "POST", body: input }),

  login: (input: LoginInput) =>
    apiFetch<UserResponse>("/api/auth/login", { method: "POST", body: input }),

  googleMock: (input: GoogleMockInput) =>
    apiFetch<UserResponse>("/api/auth/google-mock", { method: "POST", body: input }),

  completarPerfil: (input: CompletarPerfilInput) =>
    apiFetch<UserResponse & CodigoEnviadoResponse>("/api/auth/completar-perfil", {
      method: "POST",
      body: input,
    }),

  verificarWhatsapp: (input: VerificarWhatsappInput) =>
    apiFetch<UserResponse>("/api/auth/verificar-whatsapp", { method: "POST", body: input }),

  reenviarCodigo: () =>
    apiFetch<CodigoEnviadoResponse & { reenviarEn: number }>("/api/auth/reenviar-codigo", { method: "POST" }),

  logout: () => apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  me: () => apiFetch<UserResponse>("/api/auth/me"),
};
