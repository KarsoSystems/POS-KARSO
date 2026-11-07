import { NextResponse } from "next/server";
import { sinPanelDemo } from "@/server/http/panel-demo";
import { listarPedidosPanel } from "@/server/pedidos/panel-demo";
import { vencerPedidosVencidos } from "@/server/pedidos/vencimiento";
import { configuracionParaRuta } from "@/server/tienda";

/**
 * Simulador del panel: todos los pedidos, recientes primero, con el nombre del
 * cliente, y el catálogo de motivos de rechazo para el formulario (SPEC 09).
 */
export async function GET() {
  const fuera = sinPanelDemo();
  if (fuera) return fuera;
  const { configuracion, response } = await configuracionParaRuta();
  if (response) return response;
  await vencerPedidosVencidos();
  return NextResponse.json({ pedidos: await listarPedidosPanel(), motivosRechazo: configuracion.pedidos.motivosRechazo });
}
