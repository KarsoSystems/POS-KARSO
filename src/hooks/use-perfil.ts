"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserResponse } from "@/lib/auth-api";
import { perfilApi, type CambioTelefonoInput, type ContrasenaInput, type DireccionNegocioInput } from "@/lib/perfil-api";
import type { DatosFiscalesInput } from "@/lib/validation/fiscal";
import { queryKeys } from "./query-keys";

// "Mi perfil" (SPEC 10). Lo que responde con el usuario se escribe en la caché de
// la sesión: el encabezado y las demás pantallas lo ven sin otra petición.

function useGuardarEnSesion<V>(mutationFn: (variables: V) => Promise<UserResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ user }) => queryClient.setQueryData<UserResponse>(queryKeys.sesion, { user }),
  });
}

export const useGuardarDireccion = () =>
  useGuardarEnSesion((input: DireccionNegocioInput) => perfilApi.guardarDireccion(input));
export const useGuardarDatosFiscales = () =>
  useGuardarEnSesion((datos: DatosFiscalesInput) => perfilApi.guardarDatosFiscales(datos));
export const useBorrarDatosFiscales = () => useGuardarEnSesion(() => perfilApi.borrarDatosFiscales());
export const useCambiarContrasena = () =>
  useGuardarEnSesion((input: ContrasenaInput) => perfilApi.cambiarContrasena(input));

/** El cambio de teléfono en curso (para retomarlo al recargar la página). */
export function useTelefonoEnCurso() {
  return useQuery({ queryKey: queryKeys.telefonoEnCurso, queryFn: perfilApi.telefonoEnCurso, select: (d) => d.whatsappNuevo });
}

/** Pedir el cambio, reenviar o cancelar: el cambio en curso se vuelve a leer al terminar. */
function useCambioTelefono<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.telefonoEnCurso }),
  });
}

export const usePedirCambioTelefono = () =>
  useCambioTelefono((input: CambioTelefonoInput) => perfilApi.pedirCambioTelefono(input));
export const useReenviarCodigoTelefono = () => useCambioTelefono(() => perfilApi.reenviarCodigoTelefono());
export const useCancelarCambioTelefono = () => useCambioTelefono(() => perfilApi.cancelarCambioTelefono());

/** Con el código correcto el teléfono cambia: se guarda el usuario y ya no hay cambio en curso. */
export function useVerificarTelefono() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (codigo: string) => perfilApi.verificarTelefono(codigo),
    onSuccess: ({ user }) => queryClient.setQueryData<UserResponse>(queryKeys.sesion, { user }),
    // Un código agotado borra el cambio en curso: también hay que volver a leerlo.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.telefonoEnCurso }),
  });
}
