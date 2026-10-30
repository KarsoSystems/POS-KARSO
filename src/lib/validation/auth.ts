import { z } from "zod";

// Esquemas compartidos por cliente (react-hook-form) y servidor (route handlers).
// Los campos se normalizan en la salida: correo en minúsculas, WhatsApp en E.164.

const textoObligatorio = (campo: string) =>
  z
    .string()
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(60, `${campo} no puede tener más de 60 caracteres`);

export const nombreSchema = textoObligatorio("El nombre");
export const apellidoPaternoSchema = textoObligatorio("El apellido paterno");
export const apellidoMaternoSchema = textoObligatorio("El apellido materno");

/**
 * WhatsApp de México: 10 dígitos. Acepta espacios, guiones, paréntesis y el
 * prefijo opcional +52. Se guarda como "+52XXXXXXXXXX".
 */
export const whatsappSchema = z
  .string()
  .trim()
  .min(1, "El WhatsApp es obligatorio")
  .transform((valor) => valor.replace(/[\s\-()]/g, "").replace(/^\+52/, ""))
  .refine((digitos) => /^\d{10}$/.test(digitos), "El WhatsApp debe tener 10 dígitos")
  .transform((digitos) => `+52${digitos}`);

export const correoSchema = z
  .string()
  .trim()
  .min(1, "El correo es obligatorio")
  .toLowerCase()
  .pipe(z.email("Ingresa un correo válido"));

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
  .regex(/\d/, "La contraseña debe incluir al menos un número");

export const codigoVerificacionSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El código debe tener 6 dígitos");

export const registroSchema = z.object({
  nombre: nombreSchema,
  apellidoPaterno: apellidoPaternoSchema,
  apellidoMaterno: apellidoMaternoSchema,
  whatsapp: whatsappSchema,
  correo: correoSchema,
  password: passwordSchema,
});

// En login no se aplican las reglas de fuerza: solo se exige que haya algo.
export const loginSchema = z.object({
  correo: correoSchema,
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const googleMockSchema = z.object({
  nombre: nombreSchema,
  correo: correoSchema,
});

export const completarPerfilSchema = z.object({
  nombre: nombreSchema,
  apellidoPaterno: apellidoPaternoSchema,
  apellidoMaterno: apellidoMaternoSchema,
  whatsapp: whatsappSchema,
});

export const verificarWhatsappSchema = z.object({
  codigo: codigoVerificacionSchema,
});

// Input = lo que captura el formulario; Output = lo que recibe el servidor ya normalizado.
export type RegistroInput = z.input<typeof registroSchema>;
export type RegistroData = z.output<typeof registroSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
export type GoogleMockInput = z.input<typeof googleMockSchema>;
export type GoogleMockData = z.output<typeof googleMockSchema>;
export type CompletarPerfilInput = z.input<typeof completarPerfilSchema>;
export type CompletarPerfilData = z.output<typeof completarPerfilSchema>;
export type VerificarWhatsappInput = z.input<typeof verificarWhatsappSchema>;
export type VerificarWhatsappData = z.output<typeof verificarWhatsappSchema>;
