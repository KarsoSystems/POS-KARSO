"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authApi, type UserResponse } from "@/lib/auth-api";
import { rutaParaEstado } from "@/lib/auth-routes";
import type {
  CompletarPerfilInput,
  GoogleMockInput,
  LoginInput,
  RegistroInput,
  VerificarWhatsappInput,
} from "@/lib/validation/auth";
import { queryKeys } from "./query-keys";

/** Usuario de la sesión actual. `alFallar` corre si no hay sesión (o no se pudo leer). */
export function useSesion({ alFallar }: { alFallar?: () => void } = {}) {
  const query = useQuery({ queryKey: queryKeys.sesion, queryFn: authApi.me, select: (data) => data.user });
  const fallo = query.isError;
  useEffect(() => {
    if (fallo) alFallar?.();
  }, [fallo, alFallar]);
  return query;
}

/**
 * Lee la sesión otra vez y lleva a la pantalla de su estado (o a /login si no hay).
 * Sirve cuando la API responde 401/409 porque la cuenta ya cambió de estado.
 */
export function useRedirigirSegunEstado() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    try {
      const { user } = await queryClient.fetchQuery({ queryKey: queryKeys.sesion, queryFn: authApi.me });
      router.replace(rutaParaEstado(user.estado));
    } catch {
      router.replace("/login");
    }
  };
}

/** Mutación cuya respuesta trae el usuario: se escribe en la caché de la sesión. */
function useMutacionSesion<V, R extends UserResponse>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ user }) => queryClient.setQueryData<UserResponse>(queryKeys.sesion, { user }),
  });
}

export const useLogin = () => useMutacionSesion((input: LoginInput) => authApi.login(input));
export const useRegistro = () => useMutacionSesion((input: RegistroInput) => authApi.registro(input));
export const useGoogleMock = () => useMutacionSesion((input: GoogleMockInput) => authApi.googleMock(input));
export const useCompletarPerfil = () =>
  useMutacionSesion((input: CompletarPerfilInput) => authApi.completarPerfil(input));
export const useVerificarWhatsapp = () =>
  useMutacionSesion((input: VerificarWhatsappInput) => authApi.verificarWhatsapp(input));

export function useReenviarCodigo() {
  return useMutation({ mutationFn: authApi.reenviarCodigo });
}

/** Cierra la sesión y borra toda la caché, para no dejar datos de esta cuenta. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => queryClient.clear(),
  });
}
