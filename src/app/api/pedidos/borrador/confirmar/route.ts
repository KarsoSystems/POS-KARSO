import { requireSessionUser } from "@/server/auth/guards";
import { productosParaRuta } from "@/server/tienda";
import { apiError } from "@/server/http/responses";
import { copiarArchivosAlPedido } from "@/server/pedidos/archivos-pedido";
import {
  ItemsConProblemasError,
  liberarArchivoSiNoSeUsa,
  PedidoVacioError,
  prepararConfirmacion,
  respuestaPedido,
} from "@/server/pedidos/borrador";
import { EstadoPedidoInvalidoError, pedidoRepository } from "@/server/repositories";

/**
 * "Hacer pedido": congela precios, copia los archivos a `pedidos/<folio>/`, asigna
 * el folio y pasa el borrador a `pedido`. Las advertencias de archivo no bloquean.
 */
export async function POST() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { archivo: mock, response } = await productosParaRuta();
  if (response) return response;
  const { productos } = mock;

  const vacio = () => apiError(422, "PEDIDO_VACIO", new PedidoVacioError().message);
  const borrador = await pedidoRepository.findBorrador(guard.user.id);
  if (!borrador) return vacio();

  try {
    let temporales: string[] = [];
    const pedido = await pedidoRepository.confirmar(borrador.id, async (p, folio) => {
      await prepararConfirmacion(p, productos);
      temporales = await copiarArchivosAlPedido(p, folio);
    });
    // Fuera del lock de orders.json: liberar lee los pedidos del usuario.
    for (const id of temporales) await liberarArchivoSiNoSeUsa(guard.user.id, id);
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
