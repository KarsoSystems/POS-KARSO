import { NextResponse } from "next/server";
import type { Producto } from "@/lib/catalogo/schema";
import { calcularTotales } from "@/lib/pedidos/cotizacion";
import { entradaDeArchivos, idsDeArchivos, type ArchivoDisponible } from "@/lib/pedidos/archivo-linea";
import { evaluarLinea } from "@/lib/pedidos/linea";
import { MAX_ITEMS_POR_PEDIDO, type ArchivosLineaData, type LineaData } from "@/lib/validation/pedidos";
import { toPublicArchivo, type PublicArchivo } from "@/server/domain/archivo";
import type { LineaPedido, Pedido } from "@/server/domain/pedido";
import { apiError } from "@/server/http/responses";
import {
  archivoRepository,
  EstadoPedidoInvalidoError,
  pedidoRepository,
} from "@/server/repositories";
import { borrarArchivo } from "./archivos-pedido";

// `productos` es el catálogo completo del mock del panel (sin filtrar), para que
// los problemas distingan "ya no está disponible" de "solo se vende en mostrador".

/** Lo que se capturó de una línea guardada, para volver a evaluarla. */
const datosDe = (linea: LineaPedido) => ({
  productoId: linea.productoId,
  varianteId: linea.varianteId,
  medida: linea.medida.tipo === "variable" ? { ancho: linea.medida.ancho, alto: linea.medida.alto } : null,
  especificaciones: linea.especificaciones.map((e) => e.id),
  cantidad: linea.cantidad,
  archivos: entradaDeArchivos(linea.archivos),
});

/** Archivos del usuario con esos ids, por id. Los de otro usuario no aparecen. */
async function disponiblesDe(userId: string, ids: string[]): Promise<Record<string, ArchivoDisponible>> {
  const archivos = await Promise.all([...new Set(ids)].map((id) => archivoRepository.findById(id)));
  return Object.fromEntries(
    archivos.filter((a) => a !== null && a.userId === userId).map((a) => [a!.id, toPublicArchivo(a!)]),
  );
}

/** Ids de archivo que trae la entrada de una línea. */
function idsDeEntrada(archivos: ArchivosLineaData): string[] {
  const ids = archivos.frente ? [archivos.frente] : [];
  if (archivos.reverso?.tipo === "archivo") ids.push(archivos.reverso.archivoId);
  return ids;
}

/**
 * Recalcula las líneas del borrador con el catálogo vigente y las advertencias de
 * sus archivos con las reglas vigentes. Si una línea ya no es válida (variante
 * inactiva, medida fuera de rango, calendario de un año que ya pasó…), conserva su
 * último importe y marca `problema`; la confirmación queda bloqueada hasta corregirla.
 */
export async function recalcularBorrador(pedido: Pedido, productos: Producto[]): Promise<void> {
  const disponibles = await disponiblesDe(
    pedido.userId,
    pedido.productos.flatMap((linea) => idsDeArchivos(linea.archivos)),
  );
  for (const linea of pedido.productos) {
    const evaluacion = evaluarLinea(productos, datosDe(linea), disponibles);
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
  const ids = [...new Set(pedido.productos.flatMap((linea) => idsDeArchivos(linea.archivos)))];
  const archivos = await Promise.all(ids.map((id) => archivoRepository.findById(id)));
  return Object.fromEntries(
    archivos.filter((a) => a !== null).map((a) => [a.id, toPublicArchivo(a)]),
  );
}

/** Borra el archivo (registro y binario) si ningún pedido del usuario lo usa. */
export async function liberarArchivoSiNoSeUsa(userId: string, archivoId: string): Promise<void> {
  const borrador = await pedidoRepository.findBorrador(userId);
  const pedidos = [...(borrador ? [borrador] : []), ...(await pedidoRepository.listByUser(userId))];
  if (pedidos.some((p) => p.productos.some((linea) => idsDeArchivos(linea.archivos).includes(archivoId)))) return;

  const archivo = await archivoRepository.findById(archivoId);
  if (!archivo || archivo.userId !== userId) return;
  await borrarArchivo(archivo);
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
      return await pedidoRepository.update(borrador.id, async (pedido) => {
        if (pedido.estado !== "borrador") throw new EstadoPedidoInvalidoError(pedido.id, pedido.estado);
        cambiar(pedido);
        await recalcularBorrador(pedido, productos);
      });
    } catch (error) {
      if (!(error instanceof EstadoPedidoInvalidoError) || intento > 0) throw error;
    }
  }
}

/**
 * Valida una línea contra el catálogo y sus caras (archivos del usuario y ya
 * subidos, reverso según la variante). Devuelve la línea lista (sin lineaId), con
 * las advertencias de cada archivo, o la respuesta de error 422 VALIDACION.
 */
export async function prepararLinea(
  data: LineaData,
  userId: string,
  productos: Producto[],
): Promise<{ linea: Omit<LineaPedido, "lineaId">; response?: never } | { linea?: never; response: NextResponse }> {
  const disponibles = await disponiblesDe(userId, idsDeEntrada(data.archivos));
  const evaluacion = evaluarLinea(productos, data, disponibles);
  if (!evaluacion.ok) {
    return {
      response: apiError(422, "VALIDACION", "Revisa los datos marcados", {
        [evaluacion.campo]: evaluacion.mensaje,
      }),
    };
  }

  return {
    linea: { ...evaluacion.linea, descripcion: data.descripcion, problema: null },
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
export async function prepararConfirmacion(pedido: Pedido, productos: Producto[]): Promise<void> {
  await recalcularBorrador(pedido, productos);
  if (pedido.productos.length === 0) throw new PedidoVacioError();
  if (pedido.productos.some((linea) => linea.problema !== null)) throw new ItemsConProblemasError();
}
