import { NextResponse } from "next/server";
import { datosFiscalesPerfilSchema } from "@/lib/validation/perfil";
import { requireSessionUser } from "@/server/auth/guards";
import { toPublicUser } from "@/server/domain/user";
import { parseBody } from "@/server/http/responses";
import { userRepository } from "@/server/repositories";

/** "Mi perfil" (SPEC 10): guarda los datos fiscales; el checkout los precarga al pedir factura (SPEC 06). */
export async function PUT(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, datosFiscalesPerfilSchema);
  if (body.response) return body.response;

  const user = await userRepository.update(guard.user.id, { datosFiscales: body.data.datosFiscales });
  return NextResponse.json({ user: toPublicUser(user) });
}

/** Borra los datos fiscales del perfil. Los pedidos hechos conservan su copia. */
export async function DELETE() {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const user = await userRepository.update(guard.user.id, { datosFiscales: null });
  return NextResponse.json({ user: toPublicUser(user) });
}
