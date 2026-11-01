import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import { pedidoRepository } from "@/server/repositories";

/** Pedidos del usuario sin el borrador, recientes primero. */
export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  return NextResponse.json({ pedidos: await pedidoRepository.listByUser(guard.user.id) });
}
