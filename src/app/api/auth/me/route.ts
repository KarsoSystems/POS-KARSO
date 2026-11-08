import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import { toPublicUser } from "@/server/domain/user";

export async function GET() {
  // Un token de una sesión que ya no existe (p. ej. se borró data/) borra las cookies.
  const guard = await requireSessionUser();
  if (guard.response) return guard.response;
  return NextResponse.json({ user: toPublicUser(guard.user) });
}
