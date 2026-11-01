import { describe, expect, it } from "vitest";
import { etiquetasItem, formatearCm, formatearMxn, formatearNumero } from "./formato";

describe("formato", () => {
  it("dinero en MXN desde centavos", () => {
    expect(formatearMxn(250_000)).toBe("$2,500.00");
    expect(formatearMxn(40_000)).toBe("$400.00");
    expect(formatearMxn(5)).toBe("$0.05");
    expect(formatearMxn(0)).toBe("$0.00");
  });

  it("números con separador de miles", () => {
    expect(formatearNumero(1000)).toBe("1,000");
    expect(formatearNumero(100_000)).toBe("100,000");
  });

  it("centímetros sin ceros de más", () => {
    expect(formatearCm(33)).toBe("33");
    expect(formatearCm(48.3)).toBe("48.3");
    expect(formatearCm(21.599999)).toBe("21.6");
  });
});

describe("etiquetasItem", () => {
  const catalogo = {
    hojas: [{ id: "mesa", nombre: "Mesa", anchoCm: 33, altoCm: 48.3 }],
    papeles: [{ id: "couche-150", nombre: "Couché 150 g" }],
    productos: [{ id: "volante", nombre: "Volante", tamanos: [{ id: "media-carta", nombre: "Media carta" }] }],
  };
  const item = {
    productoId: "volante",
    tamano: { tipo: "predefinido" as const, tamanoId: "media-carta" },
    anchoCm: 14,
    altoCm: 21.6,
    papelId: "couche-150",
    hojaId: "mesa",
  };

  it("usa los nombres del catálogo", () => {
    expect(etiquetasItem(catalogo, item)).toEqual({
      producto: "Volante",
      tamano: "Media carta 14 × 21.6 cm",
      papel: "Couché 150 g",
      hoja: "Mesa",
    });
  });

  it("tamaño personalizado", () => {
    expect(
      etiquetasItem(catalogo, { ...item, tamano: { tipo: "personalizado" }, anchoCm: 9, altoCm: 5 }).tamano,
    ).toBe("Personalizado 9 × 5 cm");
  });

  it("si el catálogo ya no tiene algo, muestra el id", () => {
    expect(etiquetasItem(catalogo, { ...item, papelId: "kraft", productoId: "lona" })).toMatchObject({
      producto: "lona",
      papel: "kraft",
    });
  });
});
