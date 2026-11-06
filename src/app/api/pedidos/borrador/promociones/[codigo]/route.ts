import { requireSessionUser } from "@/server/auth/guards";
import { apiError } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { CodigoNoAplicadoError, quitarCodigo } from "@/server/pedidos/checkout";
import { contextoParaRuta } from "@/server/tienda";

/** Quita un código del borrador (sin importar mayúsculas). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { contexto, response } = await contextoParaRuta();
  if (response) return response;

  try {
    return respuestaPedido(await quitarCodigo(guard.user.id, contexto, (await params).codigo));
  } catch (error) {
    if (error instanceof CodigoNoAplicadoError) return apiError(404, "NO_ENCONTRADO", error.message);
    throw error;
  }
}
