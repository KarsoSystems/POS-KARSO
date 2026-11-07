import { pagoSimuladoSchema } from "@/lib/validation/checkout";
import { requireSessionUser } from "@/server/auth/guards";
import { apiError, parseBody } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { PagoVencidoError, registrarPagoSimulado } from "@/server/pedidos/pago";
import { EstatusPedidoInvalidoError, pedidoRepository } from "@/server/repositories";

/**
 * Resultado de la página de pago simulada (SPEC 07): emula Mercado Pago Checkout
 * Pro. En producción esto lo hará el webhook de Mercado Pago, sin sesión y con
 * firma; aquí lo pide el dueño del pedido con su sesión.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, pagoSimuladoSchema);
  if (body.response) return body.response;

  const { id } = await params;
  const existente = await pedidoRepository.findById(id);
  if (!existente || existente.userId !== guard.user.id || existente.estatus === "borrador") {
    return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  }

  try {
    return respuestaPedido(await registrarPagoSimulado(id, body.data.resultado));
  } catch (error) {
    if (error instanceof PagoVencidoError) return apiError(409, "PAGO_VENCIDO", error.message);
    if (error instanceof EstatusPedidoInvalidoError) {
      return apiError(409, "ESTATUS_INVALIDO", "Este pedido ya no está esperando su pago");
    }
    throw error;
  }
}
