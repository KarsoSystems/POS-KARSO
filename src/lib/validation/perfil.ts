import { z } from "zod";
import { direccionSchema } from "@/lib/sucursales/schema";
import { passwordSchema, whatsappSchema } from "./auth";
import { datosFiscalesSchema } from "./fiscal";

// Entradas de "Mi perfil" (SPEC 10; KARSO 5.1 y 6.1). Nombre y correo no se editan.

export const TIPOS_CLIENTE = ["ocasional", "socio"] as const;

/**
 * PUT /api/perfil/direccion: tipo de cliente, nombre del negocio y dirección. El
 * socio debe dar los dos; el ocasional puede dejar la dirección en null (y su
 * nombre de negocio se descarta).
 */
export const direccionNegocioSchema = z
  .object({
    tipo: z.enum(TIPOS_CLIENTE, { error: "Tipo de cliente inválido" }),
    nombreNegocio: z.string().trim().max(120, "El nombre del negocio no puede pasar de 120 caracteres").nullable(),
    direccion: direccionSchema.nullable(),
  })
  .superRefine((datos, ctx) => {
    if (datos.tipo !== "socio") return;
    if (!datos.nombreNegocio) {
      ctx.addIssue({ code: "custom", path: ["nombreNegocio"], message: "El nombre del negocio es obligatorio para socios" });
    }
    if (!datos.direccion) {
      ctx.addIssue({ code: "custom", path: ["direccion"], message: "La dirección es obligatoria para socios" });
    }
  })
  .transform((datos) => ({ ...datos, nombreNegocio: datos.tipo === "socio" ? datos.nombreNegocio : null }));

/** PUT /api/perfil/datos-fiscales: los de la SPEC 06, con las validaciones del SAT. */
export const datosFiscalesPerfilSchema = z.object({ datosFiscales: datosFiscalesSchema });

/** POST /api/perfil/telefono: el número nuevo (que sea distinto del actual lo revisa el servidor). */
export const cambioTelefonoSchema = z.object({ whatsapp: whatsappSchema });

/** PUT /api/perfil/contrasena: la nueva y su confirmación (decisión del usuario: sin pedir la actual). */
export const contrasenaSchema = z
  .object({
    password: passwordSchema,
    confirmacion: z.string(),
  })
  .refine((datos) => datos.password === datos.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden",
  });

export type DireccionNegocioInput = z.input<typeof direccionNegocioSchema>;
export type DireccionNegocioData = z.output<typeof direccionNegocioSchema>;
export type CambioTelefonoInput = z.input<typeof cambioTelefonoSchema>;
export type ContrasenaInput = z.input<typeof contrasenaSchema>;
