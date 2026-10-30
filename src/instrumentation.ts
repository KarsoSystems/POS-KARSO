// Next ejecuta register() una vez al arrancar el servidor.
// Si AUTH_SECRET falta o es débil, el servidor no arranca (ver riesgos del SPEC 01).
export async function register() {
  const { getAuthSecret } = await import("@/server/auth/session");
  getAuthSecret();
}
