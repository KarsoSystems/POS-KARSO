import { z } from "zod";

// Esquema de las sucursales de KARSO (KARSO-PROMPT-v1.md 6.3). El servidor valida
// el mock del panel (config/mock-panel/sucursales.json) y el front usa los tipos.

const fechaSchema = z.iso.datetime({ message: "Fecha ISO 8601 inválida" });
const textoSchema = (campo: string) => z.string().trim().min(1, `${campo} es obligatorio`);

export const direccionSchema = z.object({
  calle: textoSchema("La calle"),
  colonia: textoSchema("La colonia"),
  ciudad: textoSchema("La ciudad"),
  estado: textoSchema("El estado"),
  codigoPostal: z.string().regex(/^\d{5}$/, "El código postal debe tener 5 dígitos"),
});

export const sucursalSchema = z.object({
  _id: textoSchema("El id"),
  clave: z.number().int().nonnegative(),
  nombre: textoSchema("El nombre"),
  direccion: direccionSchema,
  telefono: z.string().regex(/^\d{10}$/, "El teléfono debe tener 10 dígitos"),
  horario: textoSchema("El horario"),
  activa: z.boolean(),
  creadoEn: fechaSchema,
  actualizadoEn: fechaSchema,
});

export const sucursalesArchivoSchema = z
  .object({
    version: z.literal(1),
    ejemplo: z.boolean(), // true → la UI aclara que son sucursales de ejemplo
    sucursales: z.array(sucursalSchema),
  })
  .superRefine((archivo, ctx) => {
    const ids = new Set<string>();
    const claves = new Set<number>();
    archivo.sucursales.forEach((sucursal, i) => {
      if (ids.has(sucursal._id)) {
        ctx.addIssue({ code: "custom", path: ["sucursales", i, "_id"], message: `Id repetido: "${sucursal._id}"` });
      }
      if (claves.has(sucursal.clave)) {
        ctx.addIssue({ code: "custom", path: ["sucursales", i, "clave"], message: `Clave repetida: ${sucursal.clave}` });
      }
      ids.add(sucursal._id);
      claves.add(sucursal.clave);
    });
  });

export type Direccion = z.infer<typeof direccionSchema>;
export type Sucursal = z.infer<typeof sucursalSchema>;
export type SucursalesArchivo = z.infer<typeof sucursalesArchivoSchema>;
