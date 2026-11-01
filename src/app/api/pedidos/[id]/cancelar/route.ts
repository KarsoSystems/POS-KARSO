import { requireSessionUser } from "@/server/auth/guards";
import { apiError } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { EstadoPedidoInvalidoError, pedidoRepository } from "@/server/repositories";

/** El cliente solo puede cancelar mientras el pedido está en `pedido`. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { id } = await params;
  const existente = await pedidoRepository.findById(id);
  if (!existente || existente.userId !== guard.user.id || existente.estado === "borrador") {
    return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  }

  try {
    // El estado se revisa otra vez bajo el lock.
    const pedido = await pedidoRepository.update(id, (p) => {
      if (p.estado !== "pedido") throw new EstadoPedidoInvalidoError(p.id, p.estado);
      p.estado = "cancelado";
      p.canceladoAt = new Date().toISOString();
    });
    return respuestaPedido(pedido);
  } catch (error) {
    if (error instanceof EstadoPedidoInvalidoError) {
      return apiError(409, "ESTADO_INVALIDO", "Este pedido ya no se puede cancelar");
    }
    throw error;
  }
}
