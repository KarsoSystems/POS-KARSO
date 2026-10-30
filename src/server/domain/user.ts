export type AuthProvider = "password" | "google";

export type EstadoCuenta =
  | "perfil_incompleto" // Google sin WhatsApp/apellidos
  | "verificacion_pendiente" // datos completos, WhatsApp sin verificar
  | "activo";

export interface User {
  id: string; // UUID v4; será el _id en Mongo
  idCliente: string; // "CLI-000001", consecutivo, único, inmutable
  nombre: string;
  apellidoPaterno: string | null; // null solo mientras estado = perfil_incompleto
  apellidoMaterno: string | null;
  whatsapp: string | null; // E.164 México: "+52" + 10 dígitos
  correo: string; // en minúsculas, único
  passwordHash: string | null; // null si solo entra con Google
  providers: AuthProvider[];
  whatsappVerificado: boolean;
  correoVerificado: boolean; // true si entró con Google; false en registro por correo
  estado: EstadoCuenta;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/** Datos para crear un usuario; el repositorio asigna id, idCliente y fechas. */
export type NewUser = Omit<User, "id" | "idCliente" | "createdAt" | "updatedAt">;

/** Campos que no se pueden cambiar después de crear el usuario. */
export type ImmutableUserField = "id" | "idCliente" | "createdAt";

/** Usuario expuesto al front (GET /api/auth/me). */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export function formatIdCliente(consecutivo: number): string {
  return `CLI-${String(consecutivo).padStart(6, "0")}`;
}
