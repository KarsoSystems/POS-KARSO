// Una sesión de la tienda (SPEC 11; KARSO 2.1 a): un inicio de sesión en un
// navegador. Los tokens llevan su id (`sid`); revocarla corta la API de inmediato
// y su token de renovación deja de servir. En el backend será una colección con
// índice TTL sobre `expiraEn`.

export type MotivoRevocacion = "logout" | "cambio_contrasena" | "otras_sesiones" | "reuso";

export interface Sesion {
  id: string; // sid (UUID)
  userId: string;
  jtiVigente: string; // el del último token de renovación emitido
  jtiAnterior: string | null; // el que se acaba de rotar: se acepta 10 s (dos pestañas a la vez)
  agente: string; // User-Agent, recortado a 200 caracteres
  creadaEn: string; // ISO 8601
  renovadaEn: string;
  expiraEn: string; // renovadaEn + 7 días
  revocadaEn: string | null;
  motivoRevocacion: MotivoRevocacion | null;
}
