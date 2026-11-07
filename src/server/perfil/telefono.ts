import type { WhatsappVerification } from "@/server/domain/verification";
import type { User } from "@/server/domain/user";
import { verificationRepository } from "@/server/repositories";

// Cambio de teléfono del perfil (SPEC 10): el número nuevo vive en la verificación
// (verifications.json) hasta que el cliente escribe el código; mientras tanto, el
// del usuario sigue siendo el anterior.

/** La verificación de un cambio de teléfono en curso, o null (no hay, o es la del registro). */
export async function cambioEnCurso(user: User): Promise<WhatsappVerification | null> {
  const verificacion = await verificationRepository.findByUserId(user.id);
  return verificacion && verificacion.whatsapp !== user.whatsapp ? verificacion : null;
}
