import { describe, expect, it } from "vitest";
import { datosFiscalesSchema, REGIMENES_FISCALES, tipoPersona, USOS_CFDI, type DatosFiscalesInput } from "./fiscal";

// El ejemplo de KARSO-PROMPT-v1.md 6.1 (persona física con actividad empresarial).
const KARSO: DatosFiscalesInput = {
  rfc: "PELJ800101ABC",
  razonSocial: "JUAN PEREZ LOPEZ",
  regimenFiscal: "612",
  codigoPostal: "64000",
  usoCfdi: "G03",
  correoFactura: "facturas@elaguila.com",
};

const errores = (datos: Partial<DatosFiscalesInput>) => {
  const resultado = datosFiscalesSchema.safeParse({ ...KARSO, ...datos });
  return resultado.success
    ? {}
    : Object.fromEntries(resultado.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("tipoPersona", () => {
  it("13 caracteres = física, 12 = moral", () => {
    expect(tipoPersona("PELJ800101ABC")).toBe("fisica");
    expect(tipoPersona("EAG950315K21")).toBe("moral");
    expect(tipoPersona("MÑO&01022912A")).toBe("fisica"); // Ñ, & y 29 de febrero
  });

  it("formato o fecha inválidos → null", () => {
    for (const rfc of ["PELJ80010ABC", "PELJ801301ABC", "PELJ800132ABC", "PELJ800230ABC", "PELJ800431ABC", "1ELJ800101ABC", "PELJ800101AB-", ""]) {
      expect(tipoPersona(rfc), rfc).toBeNull();
    }
  });
});

describe("datosFiscalesSchema", () => {
  it("el ejemplo de KARSO es válido", () => {
    expect(datosFiscalesSchema.parse(KARSO)).toEqual(KARSO);
  });

  it("normaliza RFC y razón social a mayúsculas, el correo a minúsculas y quita espacios de más", () => {
    expect(
      datosFiscalesSchema.parse({
        ...KARSO,
        rfc: " pelj800101abc ",
        razonSocial: "  juan   pérez lópez ",
        usoCfdi: "g03",
        correoFactura: " Facturas@ElAguila.com ",
      }),
    ).toEqual({ ...KARSO, razonSocial: "JUAN PÉREZ LÓPEZ" });
  });

  it("persona moral con régimen 601", () => {
    expect(errores({ rfc: "EAG950315K21", razonSocial: "IMPRENTA EL AGUILA", regimenFiscal: "601" })).toEqual({});
  });

  it("RFC con formato o fecha inválidos", () => {
    expect(errores({ rfc: "PELJ80010" })).toEqual({ rfc: "RFC inválido" });
    expect(errores({ rfc: "PELJ801301ABC" })).toEqual({ rfc: "RFC inválido" });
  });

  it("régimen que no corresponde al tipo de persona", () => {
    expect(errores({ rfc: "EAG950315K21", regimenFiscal: "612" })).toEqual({
      regimenFiscal: "El régimen 612 no aplica a personas morales",
    });
    expect(errores({ regimenFiscal: "601" })).toEqual({ regimenFiscal: "El régimen 601 no aplica a personas físicas" });
    // 626 (RESICO) y 610 aplican a las dos.
    expect(errores({ regimenFiscal: "626" })).toEqual({});
    expect(errores({ rfc: "EAG950315K21", regimenFiscal: "626" })).toEqual({});
  });

  it("claves fuera de los catálogos", () => {
    expect(errores({ regimenFiscal: "999" })).toEqual({ regimenFiscal: "Elige el régimen fiscal" });
    expect(errores({ usoCfdi: "P01" })).toEqual({ usoCfdi: "Elige el uso del CFDI" }); // retirado en CFDI 4.0
  });

  it("código postal, correo y razón social", () => {
    expect(errores({ codigoPostal: "6400" })).toEqual({ codigoPostal: "El código postal debe tener 5 dígitos" });
    expect(errores({ correoFactura: "facturas@" })).toEqual({ correoFactura: "Correo inválido" });
    expect(errores({ razonSocial: "   " })).toEqual({ razonSocial: "Escribe la razón social" });
    expect(errores({ razonSocial: "A".repeat(255) })).toEqual({
      razonSocial: "La razón social no puede pasar de 254 caracteres",
    });
  });

  it("los catálogos no repiten claves", () => {
    expect(new Set(REGIMENES_FISCALES.map((r) => r.clave)).size).toBe(REGIMENES_FISCALES.length);
    expect(new Set(USOS_CFDI.map((u) => u.clave)).size).toBe(USOS_CFDI.length);
    expect(REGIMENES_FISCALES.every((r) => r.fisica || r.moral)).toBe(true);
  });
});
