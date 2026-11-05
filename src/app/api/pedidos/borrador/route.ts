import { requireSessionUser } from "@/server/auth/guards";
import { productosParaRuta } from "@/server/tienda";
import { cambiarBorrador, respuestaPedido } from "@/server/pedidos/borrador";

/** Borrador del usuario (lo crea si no hay), recalculado con el catálogo vigente del panel. */
export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { archivo: mock, response } = await productosParaRuta();
  if (response) return response;
  const { productos } = mock;

  return respuestaPedido(await cambiarBorrador(guard.user.id, productos));
}
