import { randomUUID } from "node:crypto";
import { itemSchema, MAX_ITEMS_POR_PEDIDO } from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { catalogoParaRuta } from "@/server/catalogo";
import { apiError, parseBody } from "@/server/http/responses";
import {
  cambiarBorrador,
  MaximoItemsError,
  prepararItem,
  respuestaPedido,
} from "@/server/pedidos/borrador";

export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, itemSchema);
  if (body.response) return body.response;

  const { catalogo, response } = await catalogoParaRuta();
  if (response) return response;

  const preparado = await prepararItem(body.data, guard.user.id, catalogo);
  if (preparado.response) return preparado.response;

  try {
    const pedido = await cambiarBorrador(guard.user.id, catalogo, (borrador) => {
      // Se revisa bajo el lock: dos pestañas no pueden pasar de 20 a la vez.
      if (borrador.items.length >= MAX_ITEMS_POR_PEDIDO) throw new MaximoItemsError();
      borrador.items.push({ id: randomUUID(), ...preparado.item });
    });
    return respuestaPedido(pedido, 201);
  } catch (error) {
    if (error instanceof MaximoItemsError) {
      return apiError(409, "MAXIMO_ITEMS", error.message);
    }
    throw error;
  }
}
