import { correccionArchivosSchema } from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { errorCorreccion } from "@/server/http/correccion";
import { apiError, parseBody } from "@/server/http/responses";
import { respuestaPedido } from "@/server/pedidos/borrador";
import { corregirArchivos } from "@/server/pedidos/correccion";
import { pedidoRepository } from "@/server/repositories";
import { productosParaRuta } from "@/server/tienda";

/** El cliente sube el archivo corregido de una línea rechazada (SPEC 09): reemplaza el anterior. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; lineaId: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, correccionArchivosSchema);
  if (body.response) return body.response;

  const { id, lineaId } = await params;
  const existente = await pedidoRepository.findById(id);
  if (!existente || existente.userId !== guard.user.id || existente.estatus === "borrador") {
    return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  }
  const { archivo, response } = await productosParaRuta();
  if (response) return response;

  try {
    return respuestaPedido(await corregirArchivos(guard.user.id, id, lineaId, body.data, archivo.productos));
  } catch (error) {
    return errorCorreccion(error);
  }
}
