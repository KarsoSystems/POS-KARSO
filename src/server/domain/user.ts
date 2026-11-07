import type { Direccion } from "@/lib/sucursales/schema";
import type { DatosFiscales } from "@/lib/validation/fiscal";

export type { DatosFiscales, Direccion };

/** KARSO 5.1: el socio tiene un negocio (dirección y nombre del negocio obligatorios). */
export type TipoCliente = "ocasional" | "socio";

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
  tipo: TipoCliente; // "ocasional" al registrarse; el cliente lo cambia en su perfil (SPEC 10)
  direccion: Direccion | null; // KARSO 6.1: obligatoria para socio, opcional para ocasional
  nombreNegocio: string | null; // obligatorio para socio; null para ocasional
  datosFiscales: DatosFiscales | null; // se precargan en el borrador al pedir factura (SPEC 06)
  usosPromociones: UsoPromocion[]; // provisional, mientras el backend define su colección (SPEC 06)
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/** Un código de promoción usado en un pedido hecho; se quita al cancelar ese pedido. */
export interface UsoPromocion {
  promocionId: string;
  codigo: string;
  pedidoId: string;
  fecha: string; // al hacer el pedido
}

/** Datos para crear un usuario; el repositorio asigna id, idCliente, fechas, datos del perfil y usos. */
export type NewUser = Omit<
  User,
  "id" | "idCliente" | "createdAt" | "updatedAt" | "tipo" | "direccion" | "nombreNegocio" | "datosFiscales" | "usosPromociones"
>;

/** Campos que no se pueden cambiar después de crear el usuario. */
export type ImmutableUserField = "id" | "idCliente" | "createdAt";

/** Usuario expuesto al front (GET /api/auth/me). Los usos de promociones solo los lee el servidor. */
export type PublicUser = Omit<User, "passwordHash" | "usosPromociones">;

export function toPublicUser(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, usosPromociones, ...publicUser } = user;
  return publicUser;
}

export function formatIdCliente(consecutivo: number): string {
  return `CLI-${String(consecutivo).padStart(6, "0")}`;
}
