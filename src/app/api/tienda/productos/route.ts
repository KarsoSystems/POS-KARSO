import { NextResponse } from "next/server";
import { productosEnLinea, productosParaRuta } from "@/server/tienda";

// Público: KARSO define la tienda como pública (sin sesión).
export async function GET() {
  const { archivo, response } = await productosParaRuta();
  if (response) return response;
  return NextResponse.json({ ejemplo: archivo.ejemplo, productos: productosEnLinea(archivo.productos) });
}
