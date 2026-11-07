import { NextResponse } from "next/server";
import { errorPanelDemo, sinPanelDemo } from "@/server/http/panel-demo";
import { entregar } from "@/server/pedidos/panel-demo";

/** Mostrador entrega el pedido (lo cierra): solo `listo` y con saldo de $0. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const fuera = sinPanelDemo();
  if (fuera) return fuera;
  try {
    return NextResponse.json({ pedido: await entregar((await params).id) });
  } catch (error) {
    return errorPanelDemo(error);
  }
}
