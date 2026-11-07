import { describe, expect, it } from "vitest";
import { cambioTelefonoSchema, contrasenaSchema, direccionNegocioSchema } from "./perfil";

const direccion = { calle: "Av. Juárez 123", colonia: "Centro", ciudad: "Monterrey", estado: "Nuevo León", codigoPostal: "64000" };
const campos = (resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("direccionNegocioSchema (KARSO 5.1)", () => {
  it("un socio necesita nombre del negocio y dirección", () => {
    const sinNada = direccionNegocioSchema.safeParse({ tipo: "socio", nombreNegocio: "", direccion: null });
    expect(campos(sinNada)).toEqual({
      nombreNegocio: "El nombre del negocio es obligatorio para socios",
      direccion: "La dirección es obligatoria para socios",
    });
    const completo = direccionNegocioSchema.parse({ tipo: "socio", nombreNegocio: " Imprenta El Águila ", direccion });
    expect(completo).toEqual({ tipo: "socio", nombreNegocio: "Imprenta El Águila", direccion });
  });

  it("un ocasional puede no tener dirección; su nombre de negocio se descarta", () => {
    expect(direccionNegocioSchema.parse({ tipo: "ocasional", nombreNegocio: "X", direccion: null })).toEqual({
      tipo: "ocasional",
      nombreNegocio: null,
      direccion: null,
    });
  });

  it("una dirección a medias o con código postal inválido falla en su campo", () => {
    const resultado = direccionNegocioSchema.safeParse({
      tipo: "ocasional",
      nombreNegocio: null,
      direccion: { ...direccion, colonia: " ", codigoPostal: "640" },
    });
    expect(campos(resultado)).toEqual({
      "direccion.colonia": "La colonia es obligatoria",
      "direccion.codigoPostal": "El código postal debe tener 5 dígitos",
    });
  });
});

describe("cambioTelefonoSchema y contrasenaSchema", () => {
  it("el teléfono usa las reglas del registro", () => {
    expect(cambioTelefonoSchema.parse({ whatsapp: "81 1234 5678" })).toEqual({ whatsapp: "+528112345678" });
    expect(campos(cambioTelefonoSchema.safeParse({ whatsapp: "123" }))).toEqual({ whatsapp: "El WhatsApp debe tener 10 dígitos" });
  });

  it("la contraseña usa las reglas del registro y la confirmación debe coincidir", () => {
    expect(contrasenaSchema.safeParse({ password: "nueva1234", confirmacion: "nueva1234" }).success).toBe(true);
    expect(campos(contrasenaSchema.safeParse({ password: "nueva1234", confirmacion: "otra1234" }))).toEqual({
      confirmacion: "Las contraseñas no coinciden",
    });
    expect(campos(contrasenaSchema.safeParse({ password: "corta1", confirmacion: "corta1" }))).toEqual({
      password: "La contraseña debe tener al menos 8 caracteres",
    });
  });
});
