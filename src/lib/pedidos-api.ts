import { ApiError, apiBaseUrl, apiErrorFrom, apiFetch } from "@/lib/api-client";
import type { Catalogo } from "@/lib/catalogo/schema";
import {
  extensionPermitida,
  MENSAJE_ARCHIVO_GRANDE,
  MENSAJE_FORMATO_NO_PERMITIDO,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
  type ItemInput,
} from "@/lib/validation/pedidos";
// Solo tipos: se borran al compilar, no arrastran código del servidor al front.
import type { PublicArchivo } from "@/server/domain/archivo";
import type { EstadoPedido, Pedido, Subpedido } from "@/server/domain/pedido";

export type { Catalogo, EstadoPedido, Pedido, PublicArchivo, Subpedido };

/** Pedido con los datos públicos de los archivos de sus ítems, por id. */
export interface PedidoResponse {
  pedido: Pedido;
  archivos: Record<string, PublicArchivo>;
}

// Vive en archivos.ts (solo arma una URL, no hace peticiones); se reexporta para no romper imports.
export { urlArchivo } from "@/lib/archivos";

const subidaCancelada = () => new ApiError(0, "CANCELADO", "Subida cancelada");

export interface SubirArchivoOpciones {
  /** Avance de 0 a 1 mientras se envía el archivo. */
  onProgress?: (avance: number) => void;
  signal?: AbortSignal;
}

/**
 * Sube un archivo con XMLHttpRequest: `fetch` no reporta el avance de subida.
 * Antes de enviarlo revisa extensión y tamaño, para no subir 60 MB en vano.
 */
export function subirArchivo(
  archivo: File,
  { onProgress, signal }: SubirArchivoOpciones = {},
): Promise<{ archivo: PublicArchivo }> {
  if (!extensionPermitida(archivo.name)) {
    return Promise.reject(new ApiError(415, "FORMATO_NO_PERMITIDO", MENSAJE_FORMATO_NO_PERMITIDO));
  }
  if (archivo.size > TAMANO_MAXIMO_ARCHIVO_BYTES) {
    return Promise.reject(new ApiError(413, "ARCHIVO_MUY_GRANDE", MENSAJE_ARCHIVO_GRANDE));
  }
  if (signal?.aborted) return Promise.reject(subidaCancelada());

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancelar = () => xhr.abort();

    xhr.open("POST", `${apiBaseUrl()}/api/archivos`);
    xhr.withCredentials = true;
    xhr.responseType = "text";

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) onProgress?.(evento.loaded / evento.total);
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", cancelar);
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // cuerpo no JSON: se trata como error genérico
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        onProgress?.(1);
        resolve(data as { archivo: PublicArchivo });
      } else {
        reject(apiErrorFrom(xhr.status, data));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", cancelar);
      reject(new ApiError(0, "RED", "No se pudo conectar con el servidor"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", cancelar);
      reject(subidaCancelada());
    };
    signal?.addEventListener("abort", cancelar);

    const form = new FormData();
    form.append("archivo", archivo);
    xhr.send(form);
  });
}

export const pedidosApi = {
  catalogo: () => apiFetch<{ catalogo: Catalogo }>("/api/catalogo"),

  subirArchivo,

  borrador: () => apiFetch<PedidoResponse>("/api/pedidos/borrador"),

  agregarItem: (input: ItemInput) =>
    apiFetch<PedidoResponse>("/api/pedidos/borrador/items", { method: "POST", body: input }),

  editarItem: (itemId: string, input: ItemInput) =>
    apiFetch<PedidoResponse>(`/api/pedidos/borrador/items/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      body: input,
    }),

  quitarItem: (itemId: string) =>
    apiFetch<PedidoResponse>(`/api/pedidos/borrador/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    }),

  confirmar: () => apiFetch<PedidoResponse>("/api/pedidos/borrador/confirmar", { method: "POST" }),

  listar: () => apiFetch<{ pedidos: Pedido[] }>("/api/pedidos"),

  detalle: (id: string) => apiFetch<PedidoResponse>(`/api/pedidos/${encodeURIComponent(id)}`),

  cancelar: (id: string) =>
    apiFetch<PedidoResponse>(`/api/pedidos/${encodeURIComponent(id)}/cancelar`, { method: "POST" }),
};
