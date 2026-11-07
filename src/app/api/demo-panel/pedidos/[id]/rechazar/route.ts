import { NextResponse } from "next/server";
import { rechazoSchema } from "@/lib/validation/panel-demo";
import { errorPanelDemo, sinPanelDemo } from "@/server/http/panel-demo";
import { parseBody } from "@/server/http/responses";
import { rechazar } from "@/server/pedidos/panel-demo";
import { configuracionParaRuta } from "@/server/tienda";

/** Mostrador rechaza el pedido `enviado` con un motivo por línea: el cliente tiene un plazo para corregir. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const fuera = sinPanelDemo();
  if (fuera) return fuera;
  const body = await parseBody(request, rechazoSchema);
  if (body.response) return body.response;
  const { configuracion, response } = await configuracionParaRuta();
  if (response) return response;
  try {
    return NextResponse.json({ pedido: await rechazar((await params).id, body.data.lineas, configuracion) });
  } catch (error) {
    return errorPanelDemo(error);
  }
}
