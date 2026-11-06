import { NextResponse } from "next/server";
import { sucursalesActivas, sucursalesParaRuta } from "@/server/tienda";

// Público, como productos y banners: el cliente ve dónde puede recoger antes de pedir.
export async function GET() {
  const { archivo, response } = await sucursalesParaRuta();
  if (response) return response;
  return NextResponse.json({ ejemplo: archivo.ejemplo, sucursales: sucursalesActivas(archivo.sucursales) });
}
