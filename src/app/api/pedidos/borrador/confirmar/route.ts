import { requireSessionUser } from "@/server/auth/guards";
import { contextoParaRuta } from "@/server/tienda";
import { apiError } from "@/server/http/responses";
import { copiarArchivosAlPedido } from "@/server/pedidos/archivos-pedido";
import {
  cambiarBorrador,
  CheckoutIncompletoError,
  ItemsConProblemasError,
  liberarArchivoSiNoSeUsa,
  PedidoVacioError,
  prepararConfirmacion,
  PromocionInvalidaError,
  respuestaPedido,
} from "@/server/pedidos/borrador";
import { EstadoPedidoInvalidoError, pedidoRepository, userRepository } from "@/server/repositories";

/**
 * "Hacer pedido": congela precios, descuentos e IVA, copia los archivos a
 * `pedidos/<folio>/`, asigna el folio, pasa el borrador a `pedido` y registra los
 * usos de sus códigos. Exige sucursal y, con factura, datos fiscales. Las
 * advertencias de archivo no bloquean.
 */
export async function POST() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { contexto, response } = await contextoParaRuta();
  if (response) return response;

  const vacio = () => apiError(422, "PEDIDO_VACIO", new PedidoVacioError().message);
  const borrador = await pedidoRepository.findBorrador(guard.user.id);
  if (!borrador) return vacio();

  try {
    let temporales: string[] = [];
    const pedido = await pedidoRepository.confirmar(borrador.id, async (p, folio) => {
      await prepararConfirmacion(p, contexto);
      temporales = await copiarArchivosAlPedido(p, folio);
    });
    // Fuera del lock de orders.json: liberar lee los pedidos del usuario.
    for (const id of temporales) await liberarArchivoSiNoSeUsa(guard.user.id, id);
    await userRepository.registrarUsosPromociones(
      guard.user.id,
      pedido.promociones.map((p) => ({
        promocionId: p.promocionId,
        codigo: p.codigo,
        pedidoId: pedido.id,
        fecha: pedido.confirmadoAt!,
      })),
    );
    return respuestaPedido(pedido, 201);
  } catch (error) {
    if (error instanceof PedidoVacioError) return vacio();
    if (error instanceof ItemsConProblemasError) {
      return apiError(409, "ITEMS_CON_PROBLEMAS", error.message);
    }
    // La confirmación no guarda nada: se recalcula el borrador para que quede sin el
    // código o la sucursal que ya no valen, con sus avisos, y el cliente lo vea.
    if (error instanceof PromocionInvalidaError) {
      await cambiarBorrador(guard.user.id, contexto);
      return apiError(409, "PROMOCION_INVALIDA", error.message);
    }
    if (error instanceof CheckoutIncompletoError) {
      await cambiarBorrador(guard.user.id, contexto);
      return apiError(422, "CHECKOUT_INCOMPLETO", error.message, error.fields);
    }
    // Se confirmó en otra pestaña entre leer y confirmar.
    if (error instanceof EstadoPedidoInvalidoError) {
      return apiError(409, "ESTADO_INVALIDO", "Este pedido ya se confirmó");
    }
    throw error;
  }
}
