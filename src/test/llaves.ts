// Llave RS256 de la sesión (SPEC 11) para los tests: se genera en cada corrida,
// nunca se guarda en git. Vitest la carga antes de cada archivo (setupFiles).
import { generateKeyPairSync } from "node:crypto";

export function generarLlave(kid = "test-1") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    kid,
    privada: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publica: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

const llave = generarLlave();
process.env.AUTH_PRIVATE_KEY ??= llave.privada;
process.env.AUTH_KEY_ID ??= llave.kid;
