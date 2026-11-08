// AUTH_SECRET firma solo las URLs de subida (SPEC 05). Desde la SPEC 11 la sesión
// usa llaves RS256 (llaves.ts), no este secreto.

export const AUTH_SECRET_MIN_LENGTH = 32;

/** Lanza si AUTH_SECRET falta o tiene menos de 32 caracteres. */
export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `AUTH_SECRET debe estar definida y tener al menos ${AUTH_SECRET_MIN_LENGTH} caracteres`,
    );
  }
  return new TextEncoder().encode(secret);
}
