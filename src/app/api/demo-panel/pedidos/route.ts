import { NextResponse } from "next/server";
import { sinPanelDemo } from "@/server/http/panel-demo";
import { listarPedidosPanel } from "@/server/pedidos/panel-demo";
import { vencerPagosVencidos } from "@/server/pedidos/pago";

/** Simulador del panel: todos los pedidos, recientes primero, con el nombre del cliente. */
export async function GET() {
  const fuera = sinPanelDemo();
  if (fuera) return fuera;
  await vencerPagosVencidos();
  return NextResponse.json({ pedidos: await listarPedidosPanel() });
}
