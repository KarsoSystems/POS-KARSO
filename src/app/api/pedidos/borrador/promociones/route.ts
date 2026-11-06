import { codigoPromocionSchema } from "@/lib/validation/checkout";
import { requireSessionUser } from "@/server/auth/guards";
import { apiError, parseBody } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { aplicarCodigo, CampoCheckoutError } from "@/server/pedidos/checkout";
import { contextoParaRuta } from "@/server/tienda";

/** Aplica un código de promoción al borrador (KARSO 5.5). */
export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, codigoPromocionSchema);
  if (body.response) return body.response;

  const { contexto, response } = await contextoParaRuta();
  if (response) return response;

  try {
    return respuestaPedido(await aplicarCodigo(guard.user.id, contexto, body.data.codigo));
  } catch (error) {
    if (error instanceof CampoCheckoutError) {
      return apiError(422, "VALIDACION", error.message, { [error.campo]: error.message });
    }
    throw error;
  }
}
