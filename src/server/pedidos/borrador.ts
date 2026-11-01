import { NextResponse } from "next/server";
import type { Catalogo } from "@/lib/catalogo/schema";
import { evaluarItem } from "@/lib/pedidos/item";
import { calcularTotales } from "@/lib/pedidos/presupuesto";
import { MAX_ITEMS_POR_PEDIDO, type ItemData } from "@/lib/validation/pedidos";
import { archivoKey, toPublicArchivo, type PublicArchivo } from "@/server/domain/archivo";
import type { Pedido, Subpedido } from "@/server/domain/pedido";
import { apiError } from "@/server/http/responses";
import {
  archivoRepository,
  EstadoPedidoInvalidoError,
  pedidoRepository,
} from "@/server/repositories";
import { fileStorage } from "@/server/storage";

/**
 * Recalcula los ítems del borrador con el catálogo vigente. Si un ítem ya no es
 * válido (se quitó el papel, el producto…), conserva su último presupuesto y
 * marca `problema`; la confirmación queda bloqueada hasta corregirlo.
 */
export function recalcularBorrador(pedido: Pedido, catalogo: Catalogo): void {
  for (const item of pedido.items) {
    const evaluacion = evaluarItem(catalogo, item);
    if (evaluacion.ok) {
      item.anchoCm = evaluacion.anchoCm;
      item.altoCm = evaluacion.altoCm;
      item.presupuesto = evaluacion.presupuesto;
      item.problema = null;
    } else {
      item.problema = evaluacion.mensaje;
    }
  }
  pedido.totales = calcularTotales(pedido.items, catalogo.tasaIva);
}

/** Datos públicos de los archivos que usan los ítems, por id (para miniaturas y nombres). */
export async function archivosDe(pedido: Pedido): Promise<Record<string, PublicArchivo>> {
  const ids = [...new Set(pedido.items.map((item) => item.archivoId))];
  const archivos = await Promise.all(ids.map((id) => archivoRepository.findById(id)));
  return Object.fromEntries(
    archivos.filter((a) => a !== null).map((a) => [a.id, toPublicArchivo(a)]),
  );
}

/** Borra el archivo (registro y binario) si ningún pedido del usuario lo usa. */
export async function liberarArchivoSiNoSeUsa(userId: string, archivoId: string): Promise<void> {
  const borrador = await pedidoRepository.findBorrador(userId);
  const pedidos = [...(borrador ? [borrador] : []), ...(await pedidoRepository.listByUser(userId))];
  if (pedidos.some((p) => p.items.some((item) => item.archivoId === archivoId))) return;

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
  constructor(itemId: string) {
    super(`Ítem ${itemId} no encontrado`);
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
  catalogo: Catalogo,
  cambiar: (pedido: Pedido) => void = () => {},
): Promise<Pedido> {
  for (let intento = 0; ; intento++) {
    const borrador = await pedidoRepository.crearBorrador(userId, catalogo.tasaIva);
    try {
      return await pedidoRepository.update(borrador.id, (pedido) => {
        if (pedido.estado !== "borrador") throw new EstadoPedidoInvalidoError(pedido.id, pedido.estado);
        cambiar(pedido);
        recalcularBorrador(pedido, catalogo);
      });
    } catch (error) {
      if (!(error instanceof EstadoPedidoInvalidoError) || intento > 0) throw error;
    }
  }
}

/**
 * Valida un ítem contra el catálogo y que el archivo sea del usuario. Devuelve
 * el subpedido listo (sin id) o la respuesta de error: 422 VALIDACION o NO_CABE.
 */
export async function prepararItem(
  data: ItemData,
  userId: string,
  catalogo: Catalogo,
): Promise<{ item: Omit<Subpedido, "id">; response?: never } | { item?: never; response: NextResponse }> {
  const archivo = await archivoRepository.findById(data.archivoId);
  if (!archivo || archivo.userId !== userId) {
    return {
      response: apiError(422, "VALIDACION", "Revisa los datos marcados", {
        archivoId: "El archivo no existe",
      }),
    };
  }

  const evaluacion = evaluarItem(catalogo, data);
  if (!evaluacion.ok) {
    return {
      response: apiError(
        422,
        evaluacion.noCabe ? "NO_CABE" : "VALIDACION",
        evaluacion.noCabe ? evaluacion.mensaje : "Revisa los datos marcados",
        { [evaluacion.campo]: evaluacion.mensaje },
      ),
    };
  }

  return {
    item: {
      ...data,
      anchoCm: evaluacion.anchoCm,
      altoCm: evaluacion.altoCm,
      presupuesto: evaluacion.presupuesto,
      problema: null,
    },
  };
}

/** Respuesta común de los endpoints de pedidos: el pedido y los archivos de sus ítems. */
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
export function prepararConfirmacion(pedido: Pedido, catalogo: Catalogo): void {
  recalcularBorrador(pedido, catalogo);
  if (pedido.items.length === 0) throw new PedidoVacioError();
  if (pedido.items.some((item) => item.problema !== null)) throw new ItemsConProblemasError();
}
