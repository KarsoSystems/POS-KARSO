import { ApiError, apiErrorFrom, apiFetch } from "@/lib/api-client";
import {
  extensionPermitida,
  MENSAJE_ARCHIVO_GRANDE,
  MENSAJE_FORMATO_NO_PERMITIDO,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
  type LineaInput,
} from "@/lib/validation/pedidos";
import type { CheckoutInput, ResultadoPago } from "@/lib/validation/checkout";
// Solo tipos: se borran al compilar, no arrastran código del servidor al front.
import type { PublicArchivo } from "@/server/domain/archivo";
import type {
  CambioEstatus,
  Cancelacion,
  EstatusLinea,
  EstatusPedido,
  LineaPedido,
  Pago,
  Pedido,
  PromocionAplicada,
  SucursalEntrega,
} from "@/server/domain/pedido";

export type {
  CambioEstatus,
  Cancelacion,
  CheckoutInput,
  EstatusLinea,
  EstatusPedido,
  ResultadoPago,
  LineaPedido,
  Pago,
  Pedido,
  PromocionAplicada,
  PublicArchivo,
  SucursalEntrega,
};

/** Pedido con los datos públicos de los archivos de sus líneas, por id. */
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

/** Respuesta de POST /api/archivos/subidas: el archivo pendiente y a dónde subirlo. */
interface SolicitudSubida {
  archivo: PublicArchivo;
  subida: { url: string; metodo: "PUT"; expiraEn: string };
}

/**
 * PUT del binario a la URL firmada con XMLHttpRequest: `fetch` no reporta el
 * avance de subida. Sin cookies: la firma autoriza (como en R2).
 */
function subirBinario(url: string, archivo: File, { onProgress, signal }: SubirArchivoOpciones): Promise<void> {
  if (signal?.aborted) return Promise.reject(subidaCancelada());
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancelar = () => xhr.abort();
    const terminar = () => signal?.removeEventListener("abort", cancelar);

    xhr.open("PUT", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) onProgress?.(evento.loaded / evento.total);
    };
    xhr.onload = () => {
      terminar();
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // cuerpo no JSON (R2 responde XML): se trata como error genérico
      }
      reject(apiErrorFrom(xhr.status, data));
    };
    xhr.onerror = () => {
      terminar();
      reject(new ApiError(0, "RED", "No se pudo conectar con el servidor"));
    };
    xhr.onabort = () => {
      terminar();
      reject(subidaCancelada());
    };
    signal?.addEventListener("abort", cancelar);
    xhr.send(archivo);
  });
}

/** Un CANCELADO de apiFetch se reporta como "Subida cancelada". */
const comoSubida = (error: unknown) =>
  error instanceof ApiError && error.code === "CANCELADO" ? subidaCancelada() : error;

/**
 * Sube un archivo en tres pasos (SPEC 05), como lo hará con R2: pide la URL
 * firmada, sube el binario con PUT (con avance y cancelación) y confirma, para
 * que el servidor lea sus datos y genere la miniatura. Antes de pedir la URL
 * revisa extensión y tamaño, para no subir 60 MB en vano.
 */
export async function subirArchivo(
  archivo: File,
  { onProgress, signal }: SubirArchivoOpciones = {},
): Promise<{ archivo: PublicArchivo }> {
  if (!extensionPermitida(archivo.name)) {
    throw new ApiError(415, "FORMATO_NO_PERMITIDO", MENSAJE_FORMATO_NO_PERMITIDO);
  }
  if (archivo.size > TAMANO_MAXIMO_ARCHIVO_BYTES) {
    throw new ApiError(413, "ARCHIVO_MUY_GRANDE", MENSAJE_ARCHIVO_GRANDE);
  }
  if (signal?.aborted) throw subidaCancelada();

  try {
    const { archivo: pendiente, subida } = await apiFetch<SolicitudSubida>("/api/archivos/subidas", {
      method: "POST",
      body: { nombre: archivo.name, bytes: archivo.size },
      signal,
    });
    await subirBinario(subida.url, archivo, { onProgress, signal });
    const confirmado = await apiFetch<{ archivo: PublicArchivo }>(
      `/api/archivos/${encodeURIComponent(pendiente.id)}/confirmar`,
      { method: "POST", signal },
    );
    onProgress?.(1);
    return confirmado;
  } catch (error) {
    throw comoSubida(error);
  }
}

export const pedidosApi = {
  subirArchivo,

  borrador: () => apiFetch<PedidoResponse>("/api/pedidos/borrador"),

  agregarItem: (input: LineaInput) =>
    apiFetch<PedidoResponse>("/api/pedidos/borrador/items", { method: "POST", body: input }),

  editarItem: (lineaId: string, input: LineaInput) =>
    apiFetch<PedidoResponse>(`/api/pedidos/borrador/items/${encodeURIComponent(lineaId)}`, {
      method: "PUT",
      body: input,
    }),

  quitarItem: (lineaId: string) =>
    apiFetch<PedidoResponse>(`/api/pedidos/borrador/items/${encodeURIComponent(lineaId)}`, {
      method: "DELETE",
    }),

  /** Sucursal de entrega, "Requiero factura" y datos fiscales del borrador (cambios parciales). */
  cambiarCheckout: (input: CheckoutInput) =>
    apiFetch<PedidoResponse>("/api/pedidos/borrador", { method: "PATCH", body: input }),

  aplicarCodigo: (codigo: string) =>
    apiFetch<PedidoResponse>("/api/pedidos/borrador/promociones", { method: "POST", body: { codigo } }),

  quitarCodigo: (codigo: string) =>
    apiFetch<PedidoResponse>(`/api/pedidos/borrador/promociones/${encodeURIComponent(codigo)}`, {
      method: "DELETE",
    }),

  confirmar: () => apiFetch<PedidoResponse>("/api/pedidos/borrador/confirmar", { method: "POST" }),

  listar: () => apiFetch<{ pedidos: Pedido[] }>("/api/pedidos"),

  detalle: (id: string) => apiFetch<PedidoResponse>(`/api/pedidos/${encodeURIComponent(id)}`),

  /** El pedido del usuario con ese folio: lo abre el QR de seguimiento (SPEC 08). */
  porFolio: (folio: string) => apiFetch<PedidoResponse>(`/api/pedidos/folio/${encodeURIComponent(folio)}`),

  /** Página de pago simulada (SPEC 07): lo que respondería Mercado Pago. */
  pagarSimulado: (id: string, resultado: ResultadoPago) =>
    apiFetch<PedidoResponse>(`/api/pedidos/${encodeURIComponent(id)}/pago-simulado`, {
      method: "POST",
      body: { resultado },
    }),

};
