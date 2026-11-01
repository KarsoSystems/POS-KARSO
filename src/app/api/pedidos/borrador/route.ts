import { requireSessionUser } from "@/server/auth/guards";
import { catalogoParaRuta } from "@/server/catalogo";
import { cambiarBorrador, respuestaPedido } from "@/server/pedidos/borrador";

/** Borrador del usuario (lo crea si no hay), recalculado con el catálogo vigente. */
export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { catalogo, response } = await catalogoParaRuta();
  if (response) return response;

  return respuestaPedido(await cambiarBorrador(guard.user.id, catalogo));
}
