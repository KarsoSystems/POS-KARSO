import { requireSessionUser } from "@/server/auth/guards";
import { errorCorreccion } from "@/server/http/correccion";
import { apiError } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { enviarCorreccion } from "@/server/pedidos/correccion";
import { pedidoRepository } from "@/server/repositories";

/** "Enviar corrección" (SPEC 09): el pedido rechazado regresa a `enviado` para que mostrador vuelva a validar. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { id } = await params;
  const existente = await pedidoRepository.findById(id);
  if (!existente || existente.userId !== guard.user.id || existente.estatus === "borrador") {
    return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  }

  try {
    return respuestaPedido(await enviarCorreccion(guard.user.id, id));
  } catch (error) {
    return errorCorreccion(error);
  }
}
