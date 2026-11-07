import type { Producto, ReglasArchivo } from "@/lib/catalogo/schema";
import { archivoDeLinea, medidaEsperadaDe, reglasDe } from "@/lib/pedidos/archivo-linea";
import {
  correccionCompleta,
  limiteCorreccion,
  MOTIVO_SIN_CORRECCION,
  rechazosVigentes,
  venceLaCorreccion,
} from "@/lib/pedidos/correccion";
import { EXTENSIONES_PERMITIDAS, TAMANO_MAXIMO_ARCHIVO_BYTES } from "@/lib/validation/pedidos";
import { toPublicArchivo, type Archivo } from "@/server/domain/archivo";
import type { ArchivoLinea, LineaPedido, Pedido } from "@/server/domain/pedido";
import { archivoRepository, EstatusPedidoInvalidoError, pedidoRepository, userRepository } from "@/server/repositories";
import { copiarCorreccion } from "./archivos-pedido";
import { liberarArchivoSiNoSeUsa } from "./borrador";

// Corrección de un pedido rechazado (KARSO 5.8; SPEC 09). El cliente sube los
// archivos nuevos de las líneas rechazadas (solo archivos: lo demás está pagado y
// congelado) y pulsa "Enviar corrección": el pedido regresa a `enviado`. Si el
// plazo vence, el pedido se cancela la primera vez que alguien lo lee, como el
// pago (SPEC 07).

export { MOTIVO_SIN_CORRECCION };

export class CorreccionVencidaError extends Error {
  constructor() {
    super("El plazo para corregir este pedido venció");
    this.name = "CorreccionVencidaError";
  }
}

export class LineaNoRechazadaError extends Error {
  constructor() {
    super("Esta línea no fue rechazada: no se puede cambiar");
    this.name = "LineaNoRechazadaError";
  }
}

export class CorreccionIncompletaError extends Error {
  constructor() {
    super("Sube el archivo corregido de cada línea rechazada");
    this.name = "CorreccionIncompletaError";
  }
}

/** Un archivo nuevo que no se puede usar en esa cara (no existe, no terminó de subirse, la cara no lleva archivo). */
export class ArchivoCorreccionInvalidoError extends Error {
  constructor(
    readonly campo: "frente" | "reverso",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ArchivoCorreccionInvalidoError";
  }
}

/** Cancela el pedido por no corregir (en el lock de `pedidoRepository.update`). */
function cancelarPorNoCorregir(pedido: Pedido): void {
  const fecha = limiteCorreccion(pedido)!;
  pedido.estatus = "cancelado";
  pedido.cancelacion = { fecha, por: "sistema", motivo: MOTIVO_SIN_CORRECCION, reembolso: null };
  pedido.historialEstatus.push({ estatus: "cancelado", fecha, por: "sistema", comentario: MOTIVO_SIN_CORRECCION });
}

/** Cancela los pedidos del usuario con la corrección vencida y libera sus códigos de promoción. */
export async function vencerCorreccionesDelUsuario(userId: string, ahora: Date = new Date()): Promise<void> {
  const vencidos = (await pedidoRepository.listByUser(userId)).filter((p) => venceLaCorreccion(p, ahora));
  for (const { id } of vencidos) {
    let cancelado = false;
    await pedidoRepository.update(id, (pedido) => {
      // Se revisa otra vez bajo el lock: pudo enviarse la corrección entre leer y cancelar.
      if (!venceLaCorreccion(pedido, ahora)) return;
      cancelarPorNoCorregir(pedido);
      cancelado = true;
    });
    if (cancelado) await userRepository.liberarUsosPromociones(userId, id);
  }
}

/** Cancela las correcciones vencidas de todos los usuarios (la lista del panel). */
export async function vencerCorreccionesVencidas(ahora: Date = new Date()): Promise<void> {
  const usuarios = new Set((await pedidoRepository.listAll()).filter((p) => venceLaCorreccion(p, ahora)).map((p) => p.userId));
  for (const userId of usuarios) await vencerCorreccionesDelUsuario(userId, ahora);
}

/** Lanza si el pedido ya no acepta correcciones: vencida (y la cancela) o no rechazado. */
function revisarRechazado(pedido: Pedido, ahora: Date): void {
  const yaCancelado = pedido.estatus === "cancelado" && pedido.cancelacion?.motivo === MOTIVO_SIN_CORRECCION;
  if (yaCancelado) throw new CorreccionVencidaError();
  if (pedido.estatus !== "rechazado") throw new EstatusPedidoInvalidoError(pedido.id, pedido.estatus);
  if (venceLaCorreccion(pedido, ahora)) throw new CorreccionVencidaError();
}

/** Reglas para un archivo de una línea cuya variante ya no está en el catálogo: solo formato y peso. */
const REGLAS_MINIMAS: ReglasArchivo = {
  requiereArchivo: true,
  formatos: [...EXTENSIONES_PERMITIDAS],
  colorRequerido: "cualquiera",
  resolucionMinima: 1,
  pesoMaximoMB: TAMANO_MAXIMO_ARCHIVO_BYTES / (1024 * 1024),
  validarMedida: false,
};

/** El archivo nuevo con sus advertencias de la SPEC 05, con las reglas del catálogo actual. */
function evaluarCara(linea: LineaPedido, productos: Producto[], archivo: Archivo, campo: "frente" | "reverso"): ArchivoLinea {
  const producto = productos.find((p) => p._id === linea.productoId);
  const variante = producto?.variantes.find((v) => v.varianteId === linea.varianteId);
  const reglas = producto && variante ? reglasDe(producto, variante) : REGLAS_MINIMAS;
  const medida = variante ? medidaEsperadaDe(variante, { ancho: linea.medida.ancho, alto: linea.medida.alto }) : null;
  const resultado = archivoDeLinea(archivo.id, { [archivo.id]: toPublicArchivo(archivo) }, reglas, medida);
  if (!resultado.ok) throw new ArchivoCorreccionInvalidoError(campo, resultado.mensaje);
  return resultado.archivo;
}

/** Archivo nuevo del usuario para una cara: tiene que ser suyo y estar subido. */
async function archivoNuevo(userId: string, id: string, campo: "frente" | "reverso"): Promise<Archivo> {
  const archivo = await archivoRepository.findById(id);
  if (!archivo || archivo.userId !== userId) throw new ArchivoCorreccionInvalidoError(campo, "El archivo no existe");
  return archivo;
}

/**
 * Reemplaza el frente o el reverso (o ambos) de una línea rechazada y la marca
 * corregida. El pedido ya debe ser del usuario (lo revisa la ruta).
 */
export async function corregirArchivos(
  userId: string,
  pedidoId: string,
  lineaId: string,
  entrada: { frente?: string; reverso?: string },
  productos: Producto[],
  ahora: Date = new Date(),
): Promise<Pedido> {
  await vencerCorreccionesDelUsuario(userId, ahora);
  const nuevos = {
    frente: entrada.frente ? await archivoNuevo(userId, entrada.frente, "frente") : null,
    reverso: entrada.reverso ? await archivoNuevo(userId, entrada.reverso, "reverso") : null,
  };
  const pendientes: (() => Promise<void>)[] = [];

  const pedido = await pedidoRepository.update(pedidoId, async (p) => {
    revisarRechazado(p, ahora);
    const rechazo = rechazosVigentes(p).find((r) => r.lineaId === lineaId);
    if (!rechazo) throw new LineaNoRechazadaError();
    const linea = p.productos.find((l) => l.lineaId === lineaId)!;
    if (nuevos.frente && !linea.archivos.frente) throw new ArchivoCorreccionInvalidoError("frente", "Esta línea no lleva archivo");
    if (nuevos.reverso && linea.archivos.reverso?.tipo !== "archivo") {
      throw new ArchivoCorreccionInvalidoError("reverso", "Esta línea no lleva reverso de archivo");
    }
    // Se evalúan las dos caras antes de copiar: si una no sirve, no se toca nada.
    const frente = nuevos.frente && evaluarCara(linea, productos, nuevos.frente, "frente");
    const reverso = nuevos.reverso && evaluarCara(linea, productos, nuevos.reverso, "reverso");

    if (nuevos.frente && frente && linea.archivos.frente) {
      const anterior = await archivoRepository.findById(linea.archivos.frente.archivoId);
      const { copia, quitarAnterior } = await copiarCorreccion(p.folio!, lineaId, "frente", nuevos.frente, anterior);
      linea.archivos.frente = { ...frente, archivoId: copia.id };
      pendientes.push(quitarAnterior);
    }
    if (nuevos.reverso && reverso && linea.archivos.reverso?.tipo === "archivo") {
      const anterior = await archivoRepository.findById(linea.archivos.reverso.archivoId);
      const { copia, quitarAnterior } = await copiarCorreccion(p.folio!, lineaId, "reverso", nuevos.reverso, anterior);
      linea.archivos.reverso = { tipo: "archivo", ...reverso, archivoId: copia.id };
      pendientes.push(quitarAnterior);
    }
    rechazo.corregidoEn = ahora.toISOString();
  });

  // Fuera del lock: el pedido ya apunta a las copias.
  for (const quitar of pendientes) await quitar();
  for (const temporal of [nuevos.frente, nuevos.reverso]) {
    if (temporal) await liberarArchivoSiNoSeUsa(userId, temporal.id);
  }
  return pedido;
}

/** "Enviar corrección": con cada línea rechazada corregida, `rechazado` → `enviado` (mostrador vuelve a validar). */
export async function enviarCorreccion(userId: string, pedidoId: string, ahora: Date = new Date()): Promise<Pedido> {
  await vencerCorreccionesDelUsuario(userId, ahora);
  return pedidoRepository.update(pedidoId, (p) => {
    revisarRechazado(p, ahora);
    if (!correccionCompleta(p)) throw new CorreccionIncompletaError();
    const fecha = ahora.toISOString();
    p.estatus = "enviado";
    p.correccionEnviadaEn = fecha;
    p.historialEstatus.push({ estatus: "enviado", fecha, por: "cliente", comentario: "Archivos corregidos por el cliente" });
  });
}
