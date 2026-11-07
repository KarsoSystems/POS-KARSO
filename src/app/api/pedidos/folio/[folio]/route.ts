import { requireSessionUser } from "@/server/auth/guards";
import { apiError } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { vencerPagosDelUsuario } from "@/server/pedidos/pago";
import { pedidoRepository } from "@/server/repositories";

/** El pedido del usuario con ese folio: lo abre el QR (`/panel/seguimiento/<folio>`). */
export async function GET(_request: Request, { params }: { params: Promise<{ folio: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { folio } = await params;
  await vencerPagosDelUsuario(guard.user.id);
  const pedido = (await pedidoRepository.listByUser(guard.user.id)).find((p) => p.folio === decodeURIComponent(folio));
  // El pedido de otro usuario responde igual que uno inexistente.
  if (!pedido) return apiError(404, "NO_ENCONTRADO", "Pedido no encontrado");
  return respuestaPedido(pedido);
}
