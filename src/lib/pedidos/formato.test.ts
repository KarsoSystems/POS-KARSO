import { describe, expect, it } from "vitest";
import {
  formatearCm,
  formatearFecha,
  formatearFechaHora,
  formatearMxn,
  formatearNumero,
  formatearPeso,
  textoCantidad,
  textoDatosArchivo,
  textoReverso,
  textoMedida,
  textoPrecioVariante,
  unidadCantidad,
} from "./formato";

describe("formato", () => {
  it("dinero en MXN desde pesos", () => {
    expect(formatearMxn(2500)).toBe("$2,500.00");
    expect(formatearMxn(755.86)).toBe("$755.86");
    expect(formatearMxn(0.05)).toBe("$0.05");
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

describe("textos de KARSO", () => {
  it("cantidad con su unidad y equivalencia en piezas", () => {
    expect(textoCantidad("millar", 2, null)).toBe("2 millares (2,000 piezas)");
    expect(textoCantidad("millar", 1, null)).toBe("1 millar (1,000 piezas)");
    expect(textoCantidad("paquete", 3, 100)).toBe("3 paquetes de 100 (300 piezas)");
    expect(textoCantidad("paquete", 1, 100)).toBe("1 paquete de 100 (100 piezas)");
    expect(textoCantidad("unidad", 2, null)).toBe("2 piezas");
    expect(textoCantidad("unidad", 1, null)).toBe("1 pieza");
    expect(textoCantidad("millar", 120, null)).toBe("120 millares (120,000 piezas)");
  });

  it("unidad del campo cantidad", () => {
    expect(unidadCantidad("millar", null)).toBe("millares");
    expect(unidadCantidad("paquete", 100)).toBe("paquetes de 100");
    expect(unidadCantidad("unidad", null)).toBe("piezas");
  });

  it("medida en cm sin ceros de más y en m con 2 decimales y área", () => {
    expect(textoMedida({ unidad: "cm", ancho: 8.7, alto: 5, area: null })).toBe("8.7 × 5 cm");
    expect(textoMedida({ unidad: "m", ancho: 2, alto: 1.5, area: 3 })).toBe("2.00 × 1.50 m · 3.00 m²");
    expect(textoMedida({ unidad: "m", ancho: 0.56, alto: 3, area: null })).toBe("0.56 × 3.00 m");
  });

  it("precio de catálogo de la variante", () => {
    const base = { piezasPorPaquete: null, volumen: "millar" as const, precioPor: "volumen" as const };
    expect(textoPrecioVariante({ ...base, precio: 1280 })).toBe("$1,280.00 por millar");
    expect(textoPrecioVariante({ ...base, precio: 15, volumen: "unidad" })).toBe("$15.00 por pieza");
    expect(textoPrecioVariante({ ...base, precio: 600, volumen: "paquete", piezasPorPaquete: 100 })).toBe(
      "$600.00 por paquete de 100",
    );
    expect(textoPrecioVariante({ ...base, precio: 55, volumen: "unidad", precioPor: "m2" })).toBe("$55.00 por m²");
    expect(textoPrecioVariante({ ...base, precio: 500, volumen: "unidad", precioPor: "metro_lineal" })).toBe(
      "$500.00 por metro lineal",
    );
  });
});

describe("datos del archivo", () => {
  it("peso en KB o MB", () => {
    expect(formatearPeso(46_000)).toBe("45 KB");
    expect(formatearPeso(100)).toBe("1 KB");
    expect(formatearPeso(3_355_443)).toBe("3.2 MB");
  });

  it("imagen: formato, color, píxeles y peso", () => {
    expect(
      textoDatosArchivo({
        extension: "tiff",
        bytes: 3_355_443,
        metadatos: { anchoPx: 1098, altoPx: 661, color: "CMYK" },
      }),
    ).toBe("TIFF · CMYK · 1098 × 661 px · 3.2 MB");
  });

  it("vector, ilegible o pendiente: formato y peso", () => {
    expect(textoDatosArchivo({ extension: "pdf", bytes: 3_355_443, metadatos: { anchoPx: null, altoPx: null, color: null } })).toBe(
      "PDF · 3.2 MB",
    );
    expect(textoDatosArchivo({ extension: "jpg", bytes: 2048, metadatos: null })).toBe("JPG · 2 KB");
  });
});

describe("textoReverso", () => {
  it("calendario y texto corto", () => {
    expect(textoReverso({ tipo: "calendario", anio: 2027 })).toBe("Calendario 2027");
    expect(textoReverso({ tipo: "texto", texto: "Gracias  por\nsu compra" })).toBe("Texto: “Gracias por su compra”");
  });

  it("recorta el texto largo a 60 caracteres con …", () => {
    const resultado = textoReverso({ tipo: "texto", texto: "a".repeat(500) });
    expect(resultado).toBe(`Texto: “${"a".repeat(59)}…”`);
  });
});

describe("fechas en la zona de la tienda", () => {
  it("la hora es la de la Ciudad de México, sin importar la zona del navegador", () => {
    // 2026-11-08T19:38Z = 8 nov, 1:38 p.m. en CDMX (UTC−6).
    expect(formatearFechaHora("2026-11-08T19:38:00.000Z")).toMatch(/^8 nov 2026, 1:38\sp\.\s?m\.$/);
    // 2027-01-01T03:00Z todavía es 31 dic 2026 en CDMX.
    expect(formatearFecha("2027-01-01T03:00:00.000Z")).toBe("31 dic 2026");
  });
});
