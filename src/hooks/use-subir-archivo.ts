"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import type { SubidaEnCurso } from "@/lib/archivos";
import { pedidosApi, type PublicArchivo } from "@/lib/pedidos-api";

/**
 * Sube un archivo con barra de progreso. Una subida nueva cancela la anterior,
 * y salir de la pantalla a media subida también la cancela.
 */
export function useSubirArchivo({ onSubido }: { onSubido: (archivo: PublicArchivo) => void }) {
  const controllerRef = useRef<AbortController | null>(null);
  const [progreso, setProgreso] = useState(0);

  const mutation = useMutation({
    mutationFn: ({ file, signal }: { file: File; signal: AbortSignal }) =>
      pedidosApi.subirArchivo(file, {
        signal,
        onProgress: (avance) => !signal.aborted && setProgreso(avance),
      }),
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  function subir(file: File) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setProgreso(0);
    mutation.mutate(
      { file, signal: controller.signal },
      {
        onSuccess: ({ archivo }) => onSubido(archivo),
        onSettled: () => {
          if (controllerRef.current === controller) controllerRef.current = null;
        },
      },
    );
  }

  const cancelada = mutation.error instanceof ApiError && mutation.error.code === "CANCELADO";
  const error = mutation.error && !cancelada
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "No se pudo subir el archivo"
    : undefined;

  const subiendo: SubidaEnCurso | null =
    mutation.isPending && mutation.variables ? { nombre: mutation.variables.file.name, progreso } : null;

  return { subir, cancelar: () => controllerRef.current?.abort(), subiendo, error };
}
