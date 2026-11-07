import { randomUUID } from "node:crypto";
import { calcularTotales } from "@/lib/pedidos/cotizacion";
import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import { anioEn, formatFolio, vencimientoPago } from "@/lib/pedidos/pago";
import type { Pedido } from "@/server/domain/pedido";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import {
  EstatusPedidoInvalidoError,
  PedidoNoEncontradoError,
  type CambiarPedido,
  type PedidoRepository,
} from "./types";

// El contador de folios vive en el mismo archivo que los pedidos: así el folio
// se asigna bajo el mismo lock que la confirmación y no se gastan en borradores.
// Versión 6 = líneas de KARSO (SPEC 04) con frente y reverso (SPEC 05), sucursal,
// factura y promociones (SPEC 06), estatus, historial, pagos y folio KAR (SPEC 07),
// estatus por línea, fechas de entrega y QR (SPEC 08); un archivo de una versión
// anterior se descarta: eran datos de prueba del demo.
// `contadores` sigue a KARSO 6.10: un consecutivo por año, "pedidos-2026".
interface OrdersFile {
  version: 6;
  contadores: Record<string, number>;
  pedidos: Pedido[];
}

/** Aplica `cambiar` sobre el pedido sin dejar que toque los campos inmutables. */
async function aplicar(pedido: Pedido, cambiar: CambiarPedido): Promise<void> {
  const { id, userId, folio, createdAt } = pedido;
  await cambiar(pedido);
  Object.assign(pedido, { id, userId, folio, createdAt, updatedAt: new Date().toISOString() });
}

export function createJsonPedidoRepository(dataDir: string = resolveDataDir()): PedidoRepository {
  const store = createJsonStore<OrdersFile>(
    "orders.json",
    { version: 6, contadores: {}, pedidos: [] },
    dataDir,
    { versionDistinta: "descartar" },
  );

  const buscar = (data: OrdersFile, id: string) => {
    const pedido = data.pedidos.find((p) => p.id === id);
    if (!pedido) throw new PedidoNoEncontradoError(id);
    return pedido;
  };

  return {
    async findBorrador(userId) {
      const data = await store.read();
      return data.pedidos.find((p) => p.userId === userId && p.estatus === "borrador") ?? null;
    },

    crearBorrador(userId) {
      return store.update((data) => {
        const existente = data.pedidos.find((p) => p.userId === userId && p.estatus === "borrador");
        if (existente) return existente;

        const now = new Date().toISOString();
        const pedido: Pedido = {
          id: randomUUID(),
          folio: null,
          userId,
          estatus: "borrador",
          historialEstatus: [],
          productos: [],
          sucursalEntregaId: null,
          sucursalEntrega: null,
          promociones: [],
          requiereFactura: false,
          datosFiscales: null,
          avisos: [],
          ...calcularTotales([]),
          vencimientoPago: null,
          pagos: [],
          pagado: 0,
          saldo: 0,
          cancelacion: null,
          fechaInicioConteo: null,
          fechaEntregaEstimada: null,
          qr: null,
          createdAt: now,
          updatedAt: now,
          confirmadoAt: null,
        };
        data.pedidos.push(pedido);
        return pedido;
      });
    },

    async findById(id) {
      const data = await store.read();
      return data.pedidos.find((p) => p.id === id) ?? null;
    },

    async listAll() {
      const data = await store.read();
      const fecha = (p: Pedido) => p.confirmadoAt ?? p.createdAt;
      return data.pedidos.filter((p) => p.estatus !== "borrador").sort((a, b) => fecha(b).localeCompare(fecha(a)));
    },

    async listByUser(userId) {
      const data = await store.read();
      const fecha = (p: Pedido) => p.confirmadoAt ?? p.createdAt;
      return data.pedidos
        .filter((p) => p.userId === userId && p.estatus !== "borrador")
        .sort((a, b) => fecha(b).localeCompare(fecha(a)));
    },

    update(id, cambiar) {
      return store.update(async (data) => {
        const pedido = buscar(data, id);
        await aplicar(pedido, cambiar);
        return pedido;
      });
    },

    confirmar(id, cambiar = () => {}, { zonaHoraria = ZONA_HORARIA_TIENDA, horasPago = 24 } = {}) {
      return store.update(async (data) => {
        const pedido = buscar(data, id);
        if (pedido.estatus !== "borrador") throw new EstatusPedidoInvalidoError(id, pedido.estatus);

        const contador = `pedidos-${anioEn(new Date(), zonaHoraria)}`;
        const consecutivo = (data.contadores[contador] ?? 0) + 1;
        const folio = formatFolio(Number(contador.slice("pedidos-".length)), consecutivo);
        await aplicar(pedido, (p) => cambiar(p, folio));
        // Si `cambiar` lanzó, no se llega aquí y el folio no se consume.
        data.contadores[contador] = consecutivo;
        pedido.folio = folio;
        pedido.qr = folio; // KARSO 6.5: el QR lleva el folio
        pedido.estatus = "pago_pendiente";
        pedido.confirmadoAt = pedido.updatedAt;
        pedido.vencimientoPago = vencimientoPago(pedido.confirmadoAt, horasPago);
        pedido.historialEstatus = [{ estatus: "pago_pendiente", fecha: pedido.confirmadoAt, por: "sistema", comentario: "" }];
        return pedido;
      });
    },
  };
}
