import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import { catalogoParaRuta } from "@/server/catalogo";

export async function GET() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { catalogo, response } = await catalogoParaRuta();
  if (response) return response;
  return NextResponse.json({ catalogo });
}
