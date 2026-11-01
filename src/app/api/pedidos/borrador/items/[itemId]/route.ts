import { itemSchema } from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { catalogoParaRuta } from "@/server/catalogo";
import { apiError, parseBody } from "@/server/http/responses";
import {
  cambiarBorrador,
  ItemNoEncontradoError,
  liberarArchivoSiNoSeUsa,
  prepararItem,
  respuestaPedido,
} from "@/server/pedidos/borrador";

type Contexto = { params: Promise<{ itemId: string }> };

const noEncontrado = () => apiError(404, "NO_ENCONTRADO", "El ítem no existe");

export async function PUT(request: Request, { params }: Contexto) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { itemId } = await params;
  const body = await parseBody(request, itemSchema);
  if (body.response) return body.response;

  const { catalogo, response } = await catalogoParaRuta();
  if (response) return response;

  const preparado = await prepararItem(body.data, guard.user.id, catalogo);
  if (preparado.response) return preparado.response;

  let archivoAnterior: string | null = null;
  try {
    const pedido = await cambiarBorrador(guard.user.id, catalogo, (borrador) => {
      const index = borrador.items.findIndex((item) => item.id === itemId);
      if (index === -1) throw new ItemNoEncontradoError(itemId);
      archivoAnterior = borrador.items[index].archivoId;
      borrador.items[index] = { id: itemId, ...preparado.item };
    });
    // Si se cambió el archivo, el anterior se borra cuando ya nadie lo usa.
    if (archivoAnterior && archivoAnterior !== preparado.item.archivoId) {
      await liberarArchivoSiNoSeUsa(guard.user.id, archivoAnterior);
    }
    return respuestaPedido(pedido);
  } catch (error) {
    if (error instanceof ItemNoEncontradoError) return noEncontrado();
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { itemId } = await params;
  const { catalogo, response } = await catalogoParaRuta();
  if (response) return response;

  let archivoId: string | null = null;
  try {
    const pedido = await cambiarBorrador(guard.user.id, catalogo, (borrador) => {
      const item = borrador.items.find((i) => i.id === itemId);
      if (!item) throw new ItemNoEncontradoError(itemId);
      archivoId = item.archivoId;
      borrador.items = borrador.items.filter((i) => i.id !== itemId);
    });
    if (archivoId) await liberarArchivoSiNoSeUsa(guard.user.id, archivoId);
    return respuestaPedido(pedido);
  } catch (error) {
    if (error instanceof ItemNoEncontradoError) return noEncontrado();
    throw error;
  }
}
