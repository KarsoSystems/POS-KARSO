import type { ConfiguracionTienda } from "@/lib/configuracion/schema";
import { estatusDelPedido, fechaEntregaLinea, fechaEntregaPedido, type EstatusLinea } from "@/lib/pedidos/entrega";
import { ETIQUETA_ESTATUS, type EstatusPedido } from "@/lib/pedidos/formato";
import type { Pedido } from "@/server/domain/pedido";
import { notificar } from "@/server/notificaciones";
import { EstatusPedidoInvalidoError, pedidoRepository, userRepository } from "@/server/repositories";

// Simulador del panel de KARSO (SPEC 08): hace en el demo lo que harán los
// endpoints del panel en el backend (validar en mostrador, mover líneas en
// producción y entregar). Solo existe con DEMO_PANEL=1; en producción, el panel es
// otro proyecto. Cada acción queda en el historial con `por: "panel-demo"`.

export const POR_PANEL_DEMO = "panel-demo";

/** El simulador solo existe con `DEMO_PANEL=1`. */
export const demoPanelActivo = (): boolean => process.env.DEMO_PANEL === "1";

export class LineaNoEncontradaError extends Error {
  constructor(lineaId: string) {
    super(`La línea ${lineaId} no existe`);
    this.name = "LineaNoEncontradaError";
  }
}

/** Una línea no regresa: recibido → en_proceso → listo. */
export class LineaNoRetrocedeError extends Error {
  constructor(de: EstatusLinea, a: EstatusLinea) {
    super(`La línea no puede pasar de ${de} a ${a}`);
    this.name = "LineaNoRetrocedeError";
  }
}

export class SaldoPendienteError extends Error {
  constructor(saldo: number) {
    super(`No se puede entregar: hay un saldo pendiente de $${saldo.toFixed(2)}`);
    this.name = "SaldoPendienteError";
  }
}

const ORDEN_LINEA: Record<EstatusLinea, number> = { recibido: 0, en_proceso: 1, listo: 2 };

function registrar(pedido: Pedido, comentario: string, fecha: string): void {
  pedido.historialEstatus.push({ estatus: pedido.estatus, fecha, por: POR_PANEL_DEMO, comentario });
}

/** Pedido con el nombre de su cliente, para la lista del simulador. */
export interface PedidoPanel extends Pedido {
  cliente: string;
}

/** Todos los pedidos (sin borradores), recientes primero, con el nombre del cliente. */
export async function listarPedidosPanel(): Promise<PedidoPanel[]> {
  const pedidos = await pedidoRepository.listAll();
  const nombres = new Map<string, string>();
  for (const userId of new Set(pedidos.map((p) => p.userId))) {
    const user = await userRepository.findById(userId);
    nombres.set(userId, user ? [user.nombre, user.apellidoPaterno].filter(Boolean).join(" ") : "—");
  }
  return pedidos.map((p) => ({ ...p, cliente: nombres.get(p.userId) ?? "—" }));
}

/**
 * Mostrador valida archivos y datos (KARSO 5.8): `enviado` → `recibido`. Empieza el
 * conteo (5.9): cada línea queda en `recibido` con su fecha de entrega, y el pedido
 * con la más tardía ("disponible para recoger a partir del…").
 */
export function validar(id: string, configuracion: ConfiguracionTienda, ahora: Date = new Date()): Promise<Pedido> {
  return pedidoRepository.update(id, (p) => {
    if (p.estatus !== "enviado") throw new EstatusPedidoInvalidoError(p.id, p.estatus);
    const fecha = ahora.toISOString();
    p.fechaInicioConteo = fecha;
    for (const linea of p.productos) {
      linea.estatus = "recibido";
      linea.fechaEntregaEstimada = fechaEntregaLinea(fecha, linea.diasEntrega, configuracion.entregas, configuracion.zonaHoraria);
    }
    p.fechaEntregaEstimada = fechaEntregaPedido(p.productos);
    p.estatus = "recibido";
    registrar(p, "Archivos y datos validados", fecha);
  });
}

/**
 * Producción mueve una línea (`en_proceso` o `listo`); el estatus del pedido se
 * calcula con sus líneas (KARSO 5.8). Al quedar todo listo, se avisa al cliente.
 */
export async function cambiarEstatusLinea(
  id: string,
  lineaId: string,
  estatus: Exclude<EstatusLinea, "recibido">,
  ahora: Date = new Date(),
): Promise<Pedido> {
  let quedoListo = false;
  const pedido = await pedidoRepository.update(id, (p) => {
    if (p.estatus !== "recibido" && p.estatus !== "en_proceso") throw new EstatusPedidoInvalidoError(p.id, p.estatus);
    const linea = p.productos.find((l) => l.lineaId === lineaId);
    if (!linea) throw new LineaNoEncontradaError(lineaId);
    const actual = linea.estatus ?? "recibido";
    if (ORDEN_LINEA[estatus] <= ORDEN_LINEA[actual]) throw new LineaNoRetrocedeError(actual, estatus);

    linea.estatus = estatus;
    const anterior: EstatusPedido = p.estatus;
    p.estatus = estatusDelPedido(p.estatus, p.productos);
    const nombre = `${linea.nombre} · ${linea.variante}`;
    const comentario = `${nombre}: ${ETIQUETA_ESTATUS[estatus].toLowerCase()}`;
    // El historial es del pedido: se registra cuando cambia su estatus (y cada avance de línea va en el comentario).
    if (p.estatus !== anterior) registrar(p, comentario, ahora.toISOString());
    // Antes estaba en recibido o en_proceso: si ahora está listo, acaba de quedar listo.
    quedoListo = (p.estatus as EstatusPedido) === "listo";
  });
  if (quedoListo) notificar("pedido.listo", pedido);
  return pedido;
}

/** Mostrador entrega el pedido (lo cierra): solo `listo` y con saldo de $0 (KARSO 5.6). */
export function entregar(id: string, ahora: Date = new Date()): Promise<Pedido> {
  return pedidoRepository.update(id, (p) => {
    if (p.estatus !== "listo") throw new EstatusPedidoInvalidoError(p.id, p.estatus);
    if (p.saldo > 0) throw new SaldoPendienteError(p.saldo);
    p.estatus = "entregado";
    registrar(p, "Entregado en sucursal", ahora.toISOString());
  });
}
