import { NextResponse } from "next/server";
import { estatusLineaSchema } from "@/lib/validation/panel-demo";
import { errorPanelDemo, sinPanelDemo } from "@/server/http/panel-demo";
import { parseBody } from "@/server/http/responses";
import { cambiarEstatusLinea } from "@/server/pedidos/panel-demo";

/** Producción mueve una línea a `en_proceso` o `listo`; el pedido se recalcula. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; lineaId: string }> }) {
  const fuera = sinPanelDemo();
  if (fuera) return fuera;
  const body = await parseBody(request, estatusLineaSchema);
  if (body.response) return body.response;
  const { id, lineaId } = await params;
  try {
    return NextResponse.json({ pedido: await cambiarEstatusLinea(id, lineaId, body.data.estatus) });
  } catch (error) {
    return errorPanelDemo(error);
  }
}
