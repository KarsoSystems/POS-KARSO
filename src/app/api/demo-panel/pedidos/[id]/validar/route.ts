import { NextResponse } from "next/server";
import { errorPanelDemo, sinPanelDemo } from "@/server/http/panel-demo";
import { validar } from "@/server/pedidos/panel-demo";
import { configuracionParaRuta } from "@/server/tienda";

/** Mostrador valida archivos y datos: `enviado` → `recibido`, con las fechas de entrega. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const fuera = sinPanelDemo();
  if (fuera) return fuera;
  const { configuracion, response } = await configuracionParaRuta();
  if (response) return response;
  try {
    return NextResponse.json({ pedido: await validar((await params).id, configuracion) });
  } catch (error) {
    return errorPanelDemo(error);
  }
}
