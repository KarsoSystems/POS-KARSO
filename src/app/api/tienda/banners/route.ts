import { NextResponse } from "next/server";
import { bannersParaRuta, bannersVigentes } from "@/server/tienda";

// Público: KARSO define la tienda como pública (sin sesión).
export async function GET() {
  const { banners, response } = await bannersParaRuta();
  if (response) return response;
  return NextResponse.json({ banners: bannersVigentes(banners) });
}
