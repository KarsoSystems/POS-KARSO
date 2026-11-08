// Next ejecuta register() una vez al arrancar el servidor.
// Si AUTH_SECRET falta o es débil (SPEC 01), o la llave de la sesión falta o no es
// RSA (SPEC 11), el servidor no arranca.
export async function register() {
  const { getAuthSecret } = await import("@/server/auth/secreto");
  getAuthSecret();
  const { llaves } = await import("@/server/auth/llaves");
  await llaves();
}
