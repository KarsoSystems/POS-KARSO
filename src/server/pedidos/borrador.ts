import { NextResponse } from "next/server";
import type { Producto } from "@/lib/catalogo/schema";
import { calcularTotales } from "@/lib/pedidos/cotizacion";
import { evaluarLinea } from "@/lib/pedidos/linea";
import { MAX_ITEMS_POR_PEDIDO, type LineaData } from "@/lib/validation/pedidos";
import { archivoKey, toPublicArchivo, type PublicArchivo } from "@/server/domain/archivo";
import type { LineaPedido, Pedido } from "@/server/domain/pedido";
import { apiError } from "@/server/http/responses";
import {
  archivoRepository,
  EstadoPedidoInvalidoError,
  pedidoRepository,
} from "@/server/repositories";
import { fileStorage } from "@/server/storage";

// `productos` es el catálogo completo del mock del panel (sin filtrar), para que
// los problemas distingan "ya no está disponible" de "solo se vende en mostrador".

/** Lo que se capturó de una línea guardada, para volver a evaluarla. */
const datosDe = (linea: LineaPedido) => ({
  productoId: linea.productoId,
  varianteId: linea.varianteId,
  medida: linea.medida.tipo === "variable" ? { ancho: linea.medida.ancho, alto: linea.medida.alto } : null,
  especificaciones: linea.especificaciones.map((e) => e.id),
  cantidad: linea.cantidad,
});

/**
 * Recalcula las líneas del borrador con el catálogo vigente. Si una línea ya no es
 * válida (variante inactiva, solo de mostrador, medida fuera de rango…), conserva
 * su último importe y marca `problema`; la confirmación queda bloqueada hasta corregirla.
 */
export function recalcularBorrador(pedido: Pedido, productos: Producto[]): void {
  for (const linea of pedido.productos) {
    const evaluacion = evaluarLinea(productos, datosDe(linea));
    if (evaluacion.ok) {
      Object.assign(linea, evaluacion.linea, { problema: null });
    } else {
      linea.problema = evaluacion.mensaje;
    }
  }
  Object.assign(pedido, calcularTotales(pedido.productos));
}

/** Datos públicos de los archivos que usan las líneas, por id (para miniaturas y nombres). */
export async function archivosDe(pedido: Pedido): Promise<Record<string, PublicArchivo>> {
  const ids = [...new Set(pedido.productos.map((linea) => linea.archivoId))];
  const archivos = await Promise.all(ids.map((id) => archivoRepository.findById(id)));
  return Object.fromEntries(
    archivos.filter((a) => a !== null).map((a) => [a.id, toPublicArchivo(a)]),
  );
}

/** Borra el archivo (registro y binario) si ningún pedido del usuario lo usa. */
export async function liberarArchivoSiNoSeUsa(userId: string, archivoId: string): Promise<void> {
  const borrador = await pedidoRepository.findBorrador(userId);
  const pedidos = [...(borrador ? [borrador] : []), ...(await pedidoRepository.listByUser(userId))];
  if (pedidos.some((p) => p.productos.some((linea) => linea.archivoId === archivoId))) return;

  const archivo = await archivoRepository.findById(archivoId);
  if (!archivo || archivo.userId !== userId) return;
  await archivoRepository.delete(archivo.id);
  await fileStorage.delete(archivoKey(archivo));
}

export class MaximoItemsError extends Error {
  constructor() {
    super(`Máximo ${MAX_ITEMS_POR_PEDIDO} ítems por pedido`);
    this.name = "MaximoItemsError";
  }
}

export class ItemNoEncontradoError extends Error {
  constructor(lineaId: string) {
    super(`Ítem ${lineaId} no encontrado`);
    this.name = "ItemNoEncontradoError";
  }
}

/**
 * Aplica `cambiar` al borrador del usuario (creándolo si no hay) y lo recalcula,
 * todo bajo el lock. Si entre leer y escribir el borrador se confirmó en otra
 * pestaña, reintenta una vez sobre el borrador nuevo.
 */
export async function cambiarBorrador(
  userId: string,
  productos: Producto[],
  cambiar: (pedido: Pedido) => void = () => {},
): Promise<Pedido> {
  for (let intento = 0; ; intento++) {
    const borrador = await pedidoRepository.crearBorrador(userId);
    try {
      return await pedidoRepository.update(borrador.id, (pedido) => {
        if (pedido.estado !== "borrador") throw new EstadoPedidoInvalidoError(pedido.id, pedido.estado);
        cambiar(pedido);
        recalcularBorrador(pedido, productos);
      });
    } catch (error) {
      if (!(error instanceof EstadoPedidoInvalidoError) || intento > 0) throw error;
    }
  }
}

/**
 * Valida una línea contra el catálogo y que el archivo sea del usuario. Devuelve
 * la línea lista (sin lineaId) o la respuesta de error 422 VALIDACION.
 */
export async function prepararLinea(
  data: LineaData,
  userId: string,
  productos: Producto[],
): Promise<{ linea: Omit<LineaPedido, "lineaId">; response?: never } | { linea?: never; response: NextResponse }> {
  const archivo = await archivoRepository.findById(data.archivoId);
  if (!archivo || archivo.userId !== userId) {
    return {
      response: apiError(422, "VALIDACION", "Revisa los datos marcados", {
        archivoId: "El archivo no existe",
      }),
    };
  }

  const evaluacion = evaluarLinea(productos, data);
  if (!evaluacion.ok) {
    return {
      response: apiError(422, "VALIDACION", "Revisa los datos marcados", {
        [evaluacion.campo]: evaluacion.mensaje,
      }),
    };
  }

  return {
    linea: { ...evaluacion.linea, archivoId: data.archivoId, descripcion: data.descripcion, problema: null },
  };
}

/** Respuesta común de los endpoints de pedidos: el pedido y los archivos de sus líneas. */
export async function respuestaPedido(pedido: Pedido, status = 200): Promise<NextResponse> {
  return NextResponse.json({ pedido, archivos: await archivosDe(pedido) }, { status });
}

export class PedidoVacioError extends Error {
  constructor() {
    super("No has agregado nada a tu pedido");
    this.name = "PedidoVacioError";
  }
}

export class ItemsConProblemasError extends Error {
  constructor() {
    super("Corrige los ítems marcados antes de hacer el pedido");
    this.name = "ItemsConProblemasError";
  }
}

/**
 * Recalcula con el catálogo vigente y valida que se pueda confirmar. Se usa
 * dentro del lock de `confirmar`: lo que queda en el pedido son los precios
 * congelados.
 */
export function prepararConfirmacion(pedido: Pedido, productos: Producto[]): void {
  recalcularBorrador(pedido, productos);
  if (pedido.productos.length === 0) throw new PedidoVacioError();
  if (pedido.productos.some((linea) => linea.problema !== null)) throw new ItemsConProblemasError();
}
