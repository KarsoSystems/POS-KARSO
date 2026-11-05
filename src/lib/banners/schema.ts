import { z } from "zod";

// Esquema de los banners de KARSO (KARSO-PROMPT-v1.md, secciones 5.12 y 6.8).
// El servidor valida el mock del panel (config/mock-panel/banners.json) y el front usa los tipos.

const fechaSchema = z.iso.datetime({ message: "Fecha ISO 8601 inválida" });

export const bannerSchema = z.object({
  _id: z.string().trim().min(1, "El id es obligatorio"),
  titulo: z.string().trim().min(1, "El título es obligatorio"),
  imagen: z.string().trim().min(1),
  imagenMovil: z.string().trim().min(1),
  liga: z.string().trim().min(1).nullable(),
  orden: z.number().int(),
  vigencia: z
    .object({ inicio: fechaSchema, fin: fechaSchema })
    .refine((v) => v.inicio <= v.fin, { message: "inicio no puede ser posterior a fin", path: ["inicio"] })
    .nullable(), // null = siempre vigente
  activo: z.boolean(),
  creadoEn: fechaSchema,
  actualizadoEn: fechaSchema,
});

export const bannersArchivoSchema = z
  .object({
    version: z.literal(1),
    banners: z.array(bannerSchema),
  })
  .superRefine((archivo, ctx) => {
    const vistos = new Set<string>();
    archivo.banners.forEach((banner, i) => {
      if (vistos.has(banner._id)) {
        ctx.addIssue({ code: "custom", path: ["banners", i, "_id"], message: `Id repetido: "${banner._id}"` });
      }
      vistos.add(banner._id);
    });
  });

export type Banner = z.infer<typeof bannerSchema>;
export type BannersArchivo = z.infer<typeof bannersArchivoSchema>;
