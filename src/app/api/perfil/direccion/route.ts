import { NextResponse } from "next/server";
import { direccionNegocioSchema } from "@/lib/validation/perfil";
import { requireSessionUser } from "@/server/auth/guards";
import { toPublicUser } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

/**
 * "Mi perfil" (SPEC 10): tipo de cliente, nombre del negocio y dirección (KARSO
 * 5.1 y 6.1). De socio a ocasional, el nombre del negocio se borra y la dirección
 * queda como la mande el cliente (opcional).
 */
export async function PUT(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, direccionNegocioSchema);
  if (body.response) return body.response;

  const { tipo, nombreNegocio, direccion } = body.data;
  const user = await userRepository.update(guard.user.id, { tipo, nombreNegocio, direccion });
  return NextResponse.json({ user: toPublicUser(user) });
}
