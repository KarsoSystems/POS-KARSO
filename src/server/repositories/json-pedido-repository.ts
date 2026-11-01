import { randomUUID } from "node:crypto";
import { calcularTotales } from "@/lib/pedidos/presupuesto";
import { formatFolio, type Pedido } from "@/server/domain/pedido";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import {
  EstadoPedidoInvalidoError,
  PedidoNoEncontradoError,
  type CambiarPedido,
  type PedidoRepository,
} from "./types";

// El contador de folios vive en el mismo archivo que los pedidos: así el folio
// se asigna bajo el mismo lock que la confirmación y no se gastan en borradores.
interface OrdersFile {
  version: 1;
  ultimoFolio: number;
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
    { version: 1, ultimoFolio: 0, pedidos: [] },
    dataDir,
  );

  const buscar = (data: OrdersFile, id: string) => {
    const pedido = data.pedidos.find((p) => p.id === id);
    if (!pedido) throw new PedidoNoEncontradoError(id);
    return pedido;
  };

  return {
    async findBorrador(userId) {
      const data = await store.read();
      return data.pedidos.find((p) => p.userId === userId && p.estado === "borrador") ?? null;
    },

    crearBorrador(userId, tasaIva) {
      return store.update((data) => {
        const existente = data.pedidos.find((p) => p.userId === userId && p.estado === "borrador");
        if (existente) return existente;

        const now = new Date().toISOString();
        const pedido: Pedido = {
          id: randomUUID(),
          folio: null,
          userId,
          estado: "borrador",
          items: [],
          totales: calcularTotales([], tasaIva),
          pago: { estado: "pendiente" },
          createdAt: now,
          updatedAt: now,
          confirmadoAt: null,
          canceladoAt: null,
        };
        data.pedidos.push(pedido);
        return pedido;
      });
    },

    async findById(id) {
      const data = await store.read();
      return data.pedidos.find((p) => p.id === id) ?? null;
    },

    async listByUser(userId) {
      const data = await store.read();
      const fecha = (p: Pedido) => p.confirmadoAt ?? p.createdAt;
      return data.pedidos
        .filter((p) => p.userId === userId && p.estado !== "borrador")
        .sort((a, b) => fecha(b).localeCompare(fecha(a)));
    },

    update(id, cambiar) {
      return store.update(async (data) => {
        const pedido = buscar(data, id);
        await aplicar(pedido, cambiar);
        return pedido;
      });
    },

    confirmar(id, cambiar = () => {}) {
      return store.update(async (data) => {
        const pedido = buscar(data, id);
        if (pedido.estado !== "borrador") throw new EstadoPedidoInvalidoError(id, pedido.estado);

        await aplicar(pedido, cambiar);
        // Si `cambiar` lanzó, no se llega aquí y el folio no se consume.
        data.ultimoFolio += 1;
        pedido.folio = formatFolio(data.ultimoFolio);
        pedido.estado = "pedido";
        pedido.confirmadoAt = pedido.updatedAt;
        return pedido;
      });
    },
  };
}
