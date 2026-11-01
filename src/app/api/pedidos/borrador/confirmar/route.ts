import { requireSessionUser } from "@/server/auth/guards";
import { catalogoParaRuta } from "@/server/catalogo";
import { apiError } from "@/server/http/responses";
import {
  ItemsConProblemasError,
  PedidoVacioError,
  prepararConfirmacion,
  respuestaPedido,
} from "@/server/pedidos/borrador";
import { EstadoPedidoInvalidoError, pedidoRepository } from "@/server/repositories";

/** "Hacer pedido": congela precios, asigna folio y pasa el borrador a `pedido`. */
export async function POST() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { catalogo, response } = await catalogoParaRuta();
  if (response) return response;

  const vacio = () => apiError(422, "PEDIDO_VACIO", new PedidoVacioError().message);
  const borrador = await pedidoRepository.findBorrador(guard.user.id);
  if (!borrador) return vacio();

  try {
    const pedido = await pedidoRepository.confirmar(borrador.id, (p) =>
      prepararConfirmacion(p, catalogo),
    );
    return respuestaPedido(pedido, 201);
  } catch (error) {
    if (error instanceof PedidoVacioError) return vacio();
    if (error instanceof ItemsConProblemasError) {
      return apiError(409, "ITEMS_CON_PROBLEMAS", error.message);
    }
    // Se confirmó en otra pestaña entre leer y confirmar.
    if (error instanceof EstadoPedidoInvalidoError) {
      return apiError(409, "ESTADO_INVALIDO", "Este pedido ya se confirmó");
    }
    throw error;
  }
}
