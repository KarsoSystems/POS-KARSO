import { requireSessionUser } from "@/server/auth/guards";
import { apiError } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { pedidoRepository } from "@/server/repositories";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { id } = await params;
  const pedido = await pedidoRepository.findById(id);
  // Un pedido de otro usuario (o el borrador, que se ve en /borrador) responde igual que uno inexistente.
  if (!pedido || pedido.userId !== guard.user.id || pedido.estado === "borrador") {
    return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  }
  return respuestaPedido(pedido);
}
