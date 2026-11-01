import { describe, expect, it } from "vitest";
import {
  cantidadSchema,
  descripcionSchema,
  esPrevisualizable,
  extensionPermitida,
  itemSchema,
  tamanoSchema,
} from "./pedidos";

const primerError = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues[0]?.message;

const itemValido = {
  archivoId: "4b6a1f6e-0000-4000-8000-000000000001",
  descripcion: "Volante de la tienda",
  productoId: "volante",
  tamano: { tipo: "predefinido", tamanoId: "media-carta" },
  papelId: "couche-150",
  hojaId: "tabloide",
  cantidad: 1000,
};

describe("tamaño", () => {
  it("acepta un tamaño predefinido", () => {
    expect(tamanoSchema.parse({ tipo: "predefinido", tamanoId: "carta" })).toEqual({
      tipo: "predefinido",
      tamanoId: "carta",
    });
  });

  it("acepta un tamaño personalizado en cm con decimales", () => {
    expect(tamanoSchema.safeParse({ tipo: "personalizado", anchoCm: 9.5, altoCm: 5.5 }).success).toBe(true);
  });

  it("rechaza medidas personalizadas en 0 o negativas", () => {
    expect(primerError(tamanoSchema.safeParse({ tipo: "personalizado", anchoCm: 0, altoCm: 5 }))).toBe(
      "El ancho debe ser mayor que 0",
    );
    expect(primerError(tamanoSchema.safeParse({ tipo: "personalizado", anchoCm: 5, altoCm: -1 }))).toBe(
      "El alto debe ser mayor que 0",
    );
  });

  it("rechaza medidas que no son número", () => {
    expect(tamanoSchema.safeParse({ tipo: "personalizado", anchoCm: "9", altoCm: 5 }).success).toBe(false);
    expect(tamanoSchema.safeParse({ tipo: "personalizado", anchoCm: Number.NaN, altoCm: 5 }).success).toBe(false);
  });

  it("rechaza un predefinido sin tamanoId", () => {
    expect(primerError(tamanoSchema.safeParse({ tipo: "predefinido", tamanoId: "" }))).toBe(
      "El tamaño es obligatorio",
    );
  });

  it("rechaza un tipo desconocido", () => {
    expect(primerError(tamanoSchema.safeParse({ tipo: "gigante" }))).toBe("Elige un tamaño");
  });
});

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

describe("itemSchema", () => {
  it("acepta un ítem válido", () => {
    expect(itemSchema.safeParse(itemValido).success).toBe(true);
  });

  it("la descripción es opcional y queda vacía", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { descripcion, ...sinDescripcion } = itemValido;
    expect(itemSchema.parse(sinDescripcion).descripcion).toBe("");
  });

  it("exige archivo, producto, papel y hoja", () => {
    for (const campo of ["archivoId", "productoId", "papelId", "hojaId"] as const) {
      const resultado = itemSchema.safeParse({ ...itemValido, [campo]: "" });
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.path).toEqual([campo]);
    }
  });

  it("indica el campo del tamaño que falla", () => {
    const resultado = itemSchema.safeParse({
      ...itemValido,
      tamano: { tipo: "personalizado", anchoCm: 0, altoCm: 5 },
    });
    expect(resultado.error?.issues[0]?.path).toEqual(["tamano", "anchoCm"]);
  });
});

describe("archivos", () => {
  it("reconoce las extensiones permitidas sin importar mayúsculas", () => {
    expect(extensionPermitida("cartel-perro.JPG")).toBe("jpg");
    expect(extensionPermitida("foto.jpeg")).toBe("jpeg");
    expect(extensionPermitida("logo.png")).toBe("png");
    expect(extensionPermitida("diseño.final.pdf")).toBe("pdf");
    expect(extensionPermitida("vector.ai")).toBe("ai");
    expect(extensionPermitida("capas.psd")).toBe("psd");
  });

  it("rechaza otras extensiones o nombres sin extensión", () => {
    expect(extensionPermitida("virus.exe")).toBeNull();
    expect(extensionPermitida("carta.docx")).toBeNull();
    expect(extensionPermitida("jpg")).toBeNull();
    expect(extensionPermitida("foto.jpg.exe")).toBeNull();
  });

  it("solo JPG y PNG son previsualizables", () => {
    expect(esPrevisualizable("jpg")).toBe(true);
    expect(esPrevisualizable("jpeg")).toBe(true);
    expect(esPrevisualizable("png")).toBe(true);
    expect(esPrevisualizable("pdf")).toBe(false);
    expect(esPrevisualizable("ai")).toBe(false);
    expect(esPrevisualizable("psd")).toBe(false);
  });
});
