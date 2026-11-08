import { NextResponse } from "next/server";
import { jwks } from "@/server/auth/llaves";

/**
 * Llaves públicas de la sesión (SPEC 11; KARSO 2.1 a): cualquier servicio verifica
 * los tokens de la tienda con esto, por `kid`. Sin sesión; caché corta para que
 * una rotación se note pronto.
 */
export async function GET() {
  return NextResponse.json(await jwks(), { headers: { "Cache-Control": "public, max-age=300" } });
}
