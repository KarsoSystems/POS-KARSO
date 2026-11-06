import { checkoutSchema } from "@/lib/validation/checkout";
import { requireSessionUser } from "@/server/auth/guards";
import { apiError, parseBody } from "@/server/http/responses";
import { cambiarBorrador, respuestaPedido } from "@/server/pedidos/borrador";
import { CampoCheckoutError, cambiarCheckout } from "@/server/pedidos/checkout";
import { contextoParaRuta } from "@/server/tienda";

/** Borrador del usuario (lo crea si no hay), recalculado con lo vigente del panel. */
export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { contexto, response } = await contextoParaRuta();
  if (response) return response;

  return respuestaPedido(await cambiarBorrador(guard.user.id, contexto));
}

/** Checkout (SPEC 06): sucursal de entrega, "Requiero factura" y datos fiscales. Cambios parciales. */
export async function PATCH(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, checkoutSchema);
  if (body.response) return body.response;

  const { contexto, response } = await contextoParaRuta();
  if (response) return response;

  try {
    return respuestaPedido(await cambiarCheckout(guard.user.id, contexto, body.data));
  } catch (error) {
    if (error instanceof CampoCheckoutError) {
      return apiError(422, "VALIDACION", "Revisa los datos marcados", { [error.campo]: error.message });
    }
    throw error;
  }
}
