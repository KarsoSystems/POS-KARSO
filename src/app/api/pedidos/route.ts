import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import { vencerPedidosDelUsuario } from "@/server/pedidos/vencimiento";
import { pedidoRepository } from "@/server/repositories";

/** Pedidos del usuario sin el borrador, recientes primero. Los de pago o corrección vencidos ya salen cancelados. */
export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  await vencerPedidosDelUsuario(guard.user.id);
  return NextResponse.json({ pedidos: await pedidoRepository.listByUser(guard.user.id) });
}
