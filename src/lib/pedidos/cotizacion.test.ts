import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Producto, ProductosArchivo } from "@/lib/catalogo/schema";
import { calcularLinea, calcularTotales, CotizacionNoDisponibleError } from "./cotizacion";

// Casos de KARSO-PROMPT-v1.md (6.5 "Cálculo del ejemplo") sobre el mock del panel.
const { productos }: ProductosArchivo = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "mock-panel", "productos.json"), "utf8"),
);
const prod = (nombre: string): Producto => productos.find((p) => p.nombre === nombre)!;
const variante = (producto: Producto, sku: string) => producto.variantes.find((v) => v.sku === sku)!;
const espec = (producto: Producto, nombre: string) => producto.especificaciones.find((e) => e.nombre === nombre)!;

const tarjeta = prod("Tarjeta");
const lona = prod("Lona 13 oz.");
const iman = prod("Imán");

const tarjetaConSuaje = () =>
  calcularLinea({
    variante: variante(tarjeta, "70000177"),
    medida: null,
    especificaciones: [espec(tarjeta, "Suaje")],
    cantidad: 2,
  });

const lonaConOjillos = () =>
  calcularLinea({
    variante: variante(lona, "70000178"),
    medida: { ancho: 2, alto: 1.5 },
    especificaciones: [espec(lona, "Ojillos")],
    cantidad: 2,
  });

describe("calcularLinea", () => {
  it("tarjeta couché × 2 millares con suaje: 115 + 40 = 155 → $310.00", () => {
    expect(tarjetaConSuaje()).toMatchObject({
      medida: { tipo: "fija", unidad: "cm", ancho: 8.7, alto: 5, area: null },
      especificaciones: [{ id: 2, nombre: "Suaje", tipoCobro: "por_volumen", precio: 40, unidades: 1, importeUnitario: 40 }],
      importeBaseUnitario: 115,
      importeEspecificacionesUnitario: 40,
      importeUnitario: 155,
      subtotal: 310,
    });
  });

  it("lona 2.00 × 1.50 m × 2 con ojillos: 165 + 42 (14 ojillos) = 207 → $414.00", () => {
    expect(lonaConOjillos()).toMatchObject({
      medida: { tipo: "variable", unidad: "m", ancho: 2, alto: 1.5, area: 3 },
      especificaciones: [{ nombre: "Ojillos", unidades: 14, importeUnitario: 42 }],
      importeBaseUnitario: 165,
      importeEspecificacionesUnitario: 42,
      importeUnitario: 207,
      subtotal: 414,
    });
  });

  it("dobladillo en 2.00 × 1.50 m: 7 m de perímetro × $10 = $70.00", () => {
    const linea = calcularLinea({
      variante: variante(lona, "70000178"),
      medida: { ancho: 2, alto: 1.5 },
      especificaciones: [espec(lona, "Dobladillo")],
      cantidad: 1,
    });
    expect(linea.especificaciones[0]).toMatchObject({ unidades: 7, importeUnitario: 70 });
  });

  it("empalme (fijo) suma $30.00 por pieza", () => {
    const linea = calcularLinea({
      variante: variante(lona, "70000178"),
      medida: { ancho: 2, alto: 1.5 },
      especificaciones: [espec(lona, "Empalme")],
      cantidad: 3,
    });
    expect(linea).toMatchObject({ importeUnitario: 195, subtotal: 585 });
  });

  it("lona de 0.50 × 0.50 m cobra el mínimo de $100.00", () => {
    const linea = calcularLinea({
      variante: variante(lona, "70000178"),
      medida: { ancho: 0.5, alto: 0.5 },
      especificaciones: [],
      cantidad: 1,
    });
    expect(linea).toMatchObject({ medida: { area: 0.25 }, importeBaseUnitario: 100, subtotal: 100 });
  });

  it("imán metro lineal de 3 m: $1,500.00, con el ancho fijo de 0.56 m", () => {
    const linea = calcularLinea({
      variante: variante(iman, "70000303"),
      medida: { ancho: 9, alto: 3 }, // el ancho capturado se ignora
      especificaciones: [],
      cantidad: 1,
    });
    expect(linea).toMatchObject({ medida: { ancho: 0.56, alto: 3, area: null }, importeBaseUnitario: 1500 });
  });

  it("imán metro lineal de 0.80 m cobra el mínimo de $500.00", () => {
    const linea = calcularLinea({
      variante: variante(iman, "70000303"),
      medida: { ancho: 0.56, alto: 0.8 },
      especificaciones: [],
      cantidad: 1,
    });
    expect(linea.importeBaseUnitario).toBe(500);
  });

  it("redondea a centavos por línea: lona 1200 dpi de 1.33 × 1.07 m = 1.4231 m² × $180 = $256.16", () => {
    const linea = calcularLinea({
      variante: variante(lona, "70000181"),
      medida: { ancho: 1.33, alto: 1.07 },
      especificaciones: [],
      cantidad: 3,
    });
    expect(linea).toMatchObject({ medida: { area: 1.4231 }, importeBaseUnitario: 256.16, subtotal: 768.48 });
  });

  it("los ojillos redondean hacia arriba: 1.60 × 0.60 m = 4.4 m ÷ 0.5 → 9", () => {
    const linea = calcularLinea({
      variante: variante(lona, "70000178"),
      medida: { ancho: 1.6, alto: 0.6 },
      especificaciones: [espec(lona, "Ojillos")],
      cantidad: 1,
    });
    expect(linea.especificaciones[0]).toMatchObject({ unidades: 9, importeUnitario: 27 });
  });

  it("por_m2 en una pieza en cm usa el área en metros", () => {
    const laminado = { ...espec(tarjeta, "Suaje"), tipoCobro: "por_m2" as const, precio: 100 };
    const linea = calcularLinea({
      variante: variante(tarjeta, "70000177"),
      medida: null,
      especificaciones: [laminado],
      cantidad: 1,
    });
    // 8.7 × 5 cm = 0.00435 m² × $100 = $0.435 → $0.44
    expect(linea.especificaciones[0]).toMatchObject({ unidades: 0.0044, importeUnitario: 0.44 });
  });

  it("una variante variable sin medida o por cotización no se puede calcular", () => {
    const sinMedida = () =>
      calcularLinea({ variante: variante(lona, "70000178"), medida: null, especificaciones: [], cantidad: 1 });
    const cotizacion = () =>
      calcularLinea({
        variante: { ...variante(tarjeta, "70000177"), precioPor: "cotizacion" },
        medida: null,
        especificaciones: [],
        cantidad: 1,
      });
    expect(sinMedida).toThrow(CotizacionNoDisponibleError);
    expect(cotizacion).toThrow("Este producto se cotiza en mostrador");
  });
});

describe("calcularTotales", () => {
  it("tarjeta + lona: subtotal y total $724.00, sin IVA ni descuento", () => {
    expect(calcularTotales([tarjetaConSuaje(), lonaConOjillos()])).toEqual({
      subtotal: 724,
      descuento: 0,
      baseIva: 724,
      tasaIva: 0,
      iva: 0,
      total: 724,
    });
  });

  it("con factura y descuento (SPEC 06) reproduce el ejemplo de KARSO: total $755.86", () => {
    expect(calcularTotales([tarjetaConSuaje(), lonaConOjillos()], 0.16, 72.4)).toEqual({
      subtotal: 724,
      descuento: 72.4,
      baseIva: 651.6,
      tasaIva: 0.16,
      iva: 104.26,
      total: 755.86,
    });
  });

  it("sin líneas todo es 0", () => {
    expect(calcularTotales([]).total).toBe(0);
  });
});
