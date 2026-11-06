import { describe, expect, it } from "vitest";
import {
  cantidadSchema,
  descripcionSchema,
  esImagen,
  extensionPermitida,
} from "./pedidos";

const primerError = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues[0]?.message;

describe("cantidad", () => {
  it("acepta de 1 a 100,000", () => {
    expect(cantidadSchema.safeParse(1).success).toBe(true);
    expect(cantidadSchema.safeParse(100_000).success).toBe(true);
  });

  it("rechaza 0 y 100,001", () => {
    expect(primerError(cantidadSchema.safeParse(0))).toBe("La cantidad mínima es 1");
    expect(primerError(cantidadSchema.safeParse(100_001))).toBe("La cantidad máxima es 100,000");
  });

  it("rechaza decimales", () => {
    expect(primerError(cantidadSchema.safeParse(1.5))).toBe("La cantidad debe ser un número entero");
  });

  it("rechaza texto", () => {
    expect(primerError(cantidadSchema.safeParse("10"))).toBe("La cantidad debe ser un número");
  });
});

describe("descripción", () => {
  it("acepta 500 caracteres y rechaza 501", () => {
    expect(descripcionSchema.safeParse("a".repeat(500)).success).toBe(true);
    expect(primerError(descripcionSchema.safeParse("a".repeat(501)))).toBe(
      "La descripción no puede tener más de 500 caracteres",
    );
  });

  it("recorta espacios", () => {
    expect(descripcionSchema.parse("  hola  ")).toBe("hola");
  });
});

describe("archivos", () => {
  it("reconoce las extensiones permitidas sin importar mayúsculas", () => {
    expect(extensionPermitida("cartel-perro.JPG")).toBe("jpg");
    expect(extensionPermitida("foto.jpeg")).toBe("jpeg");
    expect(extensionPermitida("tarjeta.TIFF")).toBe("tiff");
    expect(extensionPermitida("diseño.final.pdf")).toBe("pdf");
    expect(extensionPermitida("vector.ai")).toBe("ai");
    expect(extensionPermitida("logo.eps")).toBe("eps");
    expect(extensionPermitida("logo.svg")).toBe("svg");
  });

  it("rechaza PNG, PSD, otras extensiones o nombres sin extensión", () => {
    expect(extensionPermitida("logo.png")).toBeNull();
    expect(extensionPermitida("capas.psd")).toBeNull();
    expect(extensionPermitida("virus.exe")).toBeNull();
    expect(extensionPermitida("carta.docx")).toBeNull();
    expect(extensionPermitida("jpg")).toBeNull();
    expect(extensionPermitida("foto.jpg.exe")).toBeNull();
  });

  it("solo JPG, JPEG y TIFF son imágenes", () => {
    expect(esImagen("jpg")).toBe(true);
    expect(esImagen("jpeg")).toBe(true);
    expect(esImagen("tiff")).toBe(true);
    expect(esImagen("pdf")).toBe(false);
    expect(esImagen("ai")).toBe(false);
    expect(esImagen("eps")).toBe(false);
    expect(esImagen("svg")).toBe(false);
  });
});
