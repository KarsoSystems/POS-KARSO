import { NextResponse } from "next/server";
import type { Producto } from "@/lib/catalogo/schema";
import { calcularTotales, centavos, pesos } from "@/lib/pedidos/cotizacion";
import { avisoCodigoInvalido, calcularDescuentos, evaluarCodigo } from "@/lib/pedidos/promociones";
import { entradaDeArchivos, idsDeArchivos, type ArchivoDisponible } from "@/lib/pedidos/archivo-linea";
import { evaluarLinea } from "@/lib/pedidos/linea";
import { MAX_ITEMS_POR_PEDIDO, type ArchivosLineaData, type LineaData } from "@/lib/validation/pedidos";
import { toPublicArchivo, type PublicArchivo } from "@/server/domain/archivo";
import type { LineaPedido, Pedido, PromocionAplicada } from "@/server/domain/pedido";
import { apiError } from "@/server/http/responses";
import { cargarConfiguracion } from "@/server/mock-panel";
import {
  archivoRepository,
  EstatusPedidoInvalidoError,
  pedidoRepository,
  userRepository,
} from "@/server/repositories";
import type { ContextoTienda } from "@/server/tienda";
import { borrarArchivo } from "./archivos-pedido";

// `contexto` trae el catálogo completo del mock del panel (sin filtrar), para que
// los problemas distingan "ya no está disponible" de "solo se vende en mostrador",
// y las sucursales, promociones y configuración vigentes.

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

/** Agrega un aviso al borrador si no está ya. */
function avisar(pedido: Pedido, aviso: string): void {
  if (!pedido.avisos.includes(aviso)) pedido.avisos.push(aviso);
}

/** La sucursal elegida sigue activa: se actualiza su copia; si no, se quita con un aviso. */
function recalcularSucursal(pedido: Pedido, { sucursales }: ContextoTienda): void {
  if (!pedido.sucursalEntregaId) return;
  const sucursal = sucursales.find((s) => s._id === pedido.sucursalEntregaId);
  if (sucursal?.activa) {
    const { nombre, direccion, telefono, horario } = sucursal;
    pedido.sucursalEntrega = { nombre, direccion, telefono, horario };
    return;
  }
  avisar(pedido, `La sucursal ${pedido.sucursalEntrega?.nombre ?? "elegida"} ya no está disponible; elige otra`);
  pedido.sucursalEntregaId = null;
  pedido.sucursalEntrega = null;
}

/**
 * Los códigos aplicados que siguen valiendo, con el porcentaje vigente del panel.
 * Los que no (vencidos, agotados, inactivos, de sobra) se quitan con un aviso.
 */
async function promocionesVigentes(
  pedido: Pedido,
  { promociones, configuracion }: ContextoTienda,
  ahora: Date,
): Promise<Omit<PromocionAplicada, "descuento">[]> {
  const vigentes: Omit<PromocionAplicada, "descuento">[] = [];
  for (const aplicada of pedido.promociones) {
    const promocion = promociones.find((p) => p._id === aplicada.promocionId);
    const usos = promocion
      ? await userRepository.contarUsosPromocion(promocion._id, pedido.userId)
      : { totales: 0, delCliente: 0 };
    const evaluacion = evaluarCodigo(promocion, { ahora, usosTotales: usos.totales, usosDelCliente: usos.delCliente });
    if (!evaluacion.ok) {
      avisar(pedido, avisoCodigoInvalido(aplicada.codigo, evaluacion.motivo));
    } else if (vigentes.length >= configuracion.promociones.maxCodigosPorPedido) {
      const max = configuracion.promociones.maxCodigosPorPedido;
      avisar(pedido, `El código ${aplicada.codigo} ya no se aplica: solo se aceptan ${max} códigos por pedido`);
    } else {
      vigentes.push({ promocionId: promocion!._id, codigo: promocion!.codigo, porcentaje: promocion!.porcentaje });
    }
  }
  return vigentes;
}

/**
 * Recalcula el borrador con lo vigente del panel:
 * - las líneas con el catálogo y las advertencias de sus archivos con las reglas. Si
 *   una línea ya no es válida (variante inactiva, medida fuera de rango, calendario
 *   de un año que ya pasó…), conserva su último importe y marca `problema`; la
 *   confirmación queda bloqueada hasta corregirla;
 * - la sucursal y los códigos: los que ya no valen se quitan con un aviso;
 * - el descuento (KARSO 5.5) y el IVA (5.4): `tasaIva` de la configuración si
 *   pidió factura; si no, 0.
 */
export async function recalcularBorrador(pedido: Pedido, contexto: ContextoTienda, ahora = new Date()): Promise<void> {
  const disponibles = await disponiblesDe(
    pedido.userId,
    pedido.productos.flatMap((linea) => idsDeArchivos(linea.archivos)),
  );
  for (const linea of pedido.productos) {
    const evaluacion = evaluarLinea(contexto.productos, datosDe(linea), disponibles);
    if (evaluacion.ok) {
      Object.assign(linea, evaluacion.linea, { problema: null });
    } else {
      linea.problema = evaluacion.mensaje;
    }
  }

  recalcularSucursal(pedido, contexto);

  const { subtotal } = calcularTotales(pedido.productos);
  const vigentes = await promocionesVigentes(pedido, contexto, ahora);
  const descuentos = calcularDescuentos(
    subtotal,
    vigentes.map((p) => p.porcentaje),
    contexto.configuracion.promociones,
  );
  pedido.promociones = vigentes.map((p, i) => ({ ...p, descuento: descuentos[i] }));
  const descuento = pesos(descuentos.reduce((suma, d) => suma + centavos(d), 0));
  const tasaIva = pedido.requiereFactura ? contexto.configuracion.iva.tasa : 0;
  Object.assign(pedido, calcularTotales(pedido.productos, tasaIva, descuento));
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
  contexto: ContextoTienda,
  cambiar: (pedido: Pedido) => void | Promise<void> = () => {},
): Promise<Pedido> {
  for (let intento = 0; ; intento++) {
    const borrador = await pedidoRepository.crearBorrador(userId);
    try {
      return await pedidoRepository.update(borrador.id, async (pedido) => {
        if (pedido.estatus !== "borrador") throw new EstatusPedidoInvalidoError(pedido.id, pedido.estatus);
        await cambiar(pedido);
        await recalcularBorrador(pedido, contexto);
      });
    } catch (error) {
      if (!(error instanceof EstatusPedidoInvalidoError) || intento > 0) throw error;
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
    linea: {
      ...evaluacion.linea,
      descripcion: data.descripcion,
      problema: null,
      estatus: null,
      fechaEntregaEstimada: null,
      loteId: null,
    },
  };
}

/**
 * Nombres de los motivos de rechazo del pedido, por clave (SPEC 09): el pedido
 * guarda la clave, como KARSO, y la tienda muestra el nombre del catálogo. Si el
 * catálogo no carga o ya no tiene la clave, se muestra la clave.
 */
async function motivosDe(pedido: Pedido): Promise<Record<string, string>> {
  if (pedido.rechazos.length === 0) return {};
  let catalogo: { clave: string; nombre: string }[] = [];
  try {
    catalogo = (await cargarConfiguracion()).configuracion.pedidos.motivosRechazo;
  } catch (error) {
    console.error("[mock-panel]", (error as Error).message);
  }
  return Object.fromEntries(
    pedido.rechazos.map((r) => [r.motivo, catalogo.find((m) => m.clave === r.motivo)?.nombre ?? r.motivo]),
  );
}

/** Respuesta común de los endpoints de pedidos: el pedido, los archivos de sus líneas y los nombres de sus motivos de rechazo. */
export async function respuestaPedido(pedido: Pedido, status = 200): Promise<NextResponse> {
  return NextResponse.json(
    { pedido, archivos: await archivosDe(pedido), motivosRechazo: await motivosDe(pedido) },
    { status },
  );
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

/** Al confirmar, un código aplicado dejó de valer: el total cambió y el cliente debe verlo antes. */
export class PromocionInvalidaError extends Error {
  constructor(avisos: string[]) {
    super(`${avisos.join(". ")}. Revisa el total antes de hacer el pedido`);
    this.name = "PromocionInvalidaError";
  }
}

/** Falta la sucursal o, con factura, los datos fiscales. `fields` va tal cual en la respuesta 422. */
export class CheckoutIncompletoError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super("Completa los datos para hacer el pedido");
    this.name = "CheckoutIncompletoError";
  }
}

/**
 * Recalcula con lo vigente del panel y valida que se pueda confirmar. Se usa
 * dentro del lock de `confirmar`: lo que queda en el pedido son los precios
 * congelados. Deja el pedido listo: sin avisos y, sin factura, sin datos fiscales.
 */
export async function prepararConfirmacion(pedido: Pedido, contexto: ContextoTienda): Promise<void> {
  const codigosAntes = pedido.promociones.map((p) => p.codigo);
  const avisosAntes = pedido.avisos.length;
  await recalcularBorrador(pedido, contexto);
  if (pedido.productos.length === 0) throw new PedidoVacioError();
  if (pedido.productos.some((linea) => linea.problema !== null)) throw new ItemsConProblemasError();

  const quitados = codigosAntes.filter((codigo) => !pedido.promociones.some((p) => p.codigo === codigo));
  if (quitados.length > 0) throw new PromocionInvalidaError(pedido.avisos.slice(avisosAntes));

  const faltan: Record<string, string> = {};
  if (!pedido.sucursalEntregaId) faltan.sucursalEntregaId = "Elige la sucursal de entrega";
  if (pedido.requiereFactura && !pedido.datosFiscales) faltan.datosFiscales = "Captura tus datos fiscales";
  if (Object.keys(faltan).length > 0) throw new CheckoutIncompletoError(faltan);

  pedido.avisos = [];
  if (!pedido.requiereFactura) pedido.datosFiscales = null;
}
