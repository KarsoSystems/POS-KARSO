// Genera la llave RS256 de la sesión (SPEC 11) e imprime las líneas para .env.local.
// La privada nunca se sube a git; en producción va al gestor de secretos.
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
const kid = `tienda-${new Date().toISOString().slice(0, 10)}`;

console.log(`AUTH_PRIVATE_KEY="${pem.replace(/\n/g, "\\n")}"`);
console.log(`AUTH_KEY_ID=${kid}`);
