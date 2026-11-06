import { randomUUID } from "node:crypto";
import { lineaSchema, MAX_ITEMS_POR_PEDIDO } from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { contextoParaRuta } from "@/server/tienda";
import { apiError, parseBody } from "@/server/http/responses";
import {
  cambiarBorrador,
  MaximoItemsError,
  prepararLinea,
  respuestaPedido,
} from "@/server/pedidos/borrador";

export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, lineaSchema);
  if (body.response) return body.response;

  const { contexto, response } = await contextoParaRuta();
  if (response) return response;

  const preparado = await prepararLinea(body.data, guard.user.id, contexto.productos);
  if (preparado.response) return preparado.response;

  try {
    const pedido = await cambiarBorrador(guard.user.id, contexto, (borrador) => {
      // Se revisa bajo el lock: dos pestañas no pueden pasar de 20 a la vez.
      if (borrador.productos.length >= MAX_ITEMS_POR_PEDIDO) throw new MaximoItemsError();
      borrador.productos.push({ lineaId: randomUUID(), ...preparado.linea });
    });
    return respuestaPedido(pedido, 201);
  } catch (error) {
    if (error instanceof MaximoItemsError) {
      return apiError(409, "MAXIMO_ITEMS", error.message);
    }
    throw error;
  }
}
