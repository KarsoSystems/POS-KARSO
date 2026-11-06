import { idsDeArchivos } from "@/lib/pedidos/archivo-linea";
import { lineaSchema } from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { productosParaRuta } from "@/server/tienda";
import { apiError, parseBody } from "@/server/http/responses";
import {
  cambiarBorrador,
  ItemNoEncontradoError,
  liberarArchivoSiNoSeUsa,
  prepararLinea,
  respuestaPedido,
} from "@/server/pedidos/borrador";

type Contexto = { params: Promise<{ itemId: string }> };

const noEncontrado = () => apiError(404, "NO_ENCONTRADO", "El ítem no existe");

export async function PUT(request: Request, { params }: Contexto) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { itemId } = await params;
  const body = await parseBody(request, lineaSchema);
  if (body.response) return body.response;

  const { archivo: mock, response } = await productosParaRuta();
  if (response) return response;
  const { productos } = mock;

  const preparado = await prepararLinea(body.data, guard.user.id, productos);
  if (preparado.response) return preparado.response;

  let anteriores: string[] = [];
  try {
    const pedido = await cambiarBorrador(guard.user.id, productos, (borrador) => {
      const index = borrador.productos.findIndex((linea) => linea.lineaId === itemId);
      if (index === -1) throw new ItemNoEncontradoError(itemId);
      anteriores = idsDeArchivos(borrador.productos[index].archivos);
      borrador.productos[index] = { lineaId: itemId, ...preparado.linea };
    });
    // Si se cambió un archivo (frente o reverso), el anterior se borra cuando ya nadie lo usa.
    const actuales = idsDeArchivos(preparado.linea.archivos);
    for (const id of anteriores) if (!actuales.includes(id)) await liberarArchivoSiNoSeUsa(guard.user.id, id);
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
  const { archivo: mock, response } = await productosParaRuta();
  if (response) return response;
  const { productos } = mock;

  let ids: string[] = [];
  try {
    const pedido = await cambiarBorrador(guard.user.id, productos, (borrador) => {
      const linea = borrador.productos.find((l) => l.lineaId === itemId);
      if (!linea) throw new ItemNoEncontradoError(itemId);
      ids = idsDeArchivos(linea.archivos);
      borrador.productos = borrador.productos.filter((l) => l.lineaId !== itemId);
    });
    for (const id of ids) await liberarArchivoSiNoSeUsa(guard.user.id, id);
    return respuestaPedido(pedido);
  } catch (error) {
    if (error instanceof ItemNoEncontradoError) return noEncontrado();
    throw error;
  }
}
