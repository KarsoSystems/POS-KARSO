import { describe, expect, it } from "vitest";
import { calcularAcomodo } from "./acomodo";

// Valores del catálogo de ejemplo.
const TABLOIDE = { anchoCm: 27.9, altoCm: 43.2 }; // útil 26.9 × 42.2
const MESA = { anchoCm: 33, altoCm: 48.3 }; // útil 32 × 47.3
const MARGEN = 0.5;
const SEPARACION = 0.3;

const acomodar = (anchoCm: number, altoCm: number, hoja = TABLOIDE) =>
  calcularAcomodo({ anchoCm, altoCm }, hoja, MARGEN, SEPARACION);

describe("calcularAcomodo", () => {
  it("media carta en tabloide: 2 por hoja, girada (1 columna × 2 filas)", () => {
    // Normal: ⌊27.2/14.3⌋=1 × ⌊42.5/21.9⌋=1 = 1. Girada: ⌊27.2/21.9⌋=1 × ⌊42.5/14.3⌋=2 = 2.
    expect(acomodar(14, 21.6)).toEqual({ piezasPorHoja: 2, columnas: 1, filas: 2, rotada: true });
  });

  it("media carta en mesa: 4 por hoja, sin girar (2 × 2)", () => {
    // Normal: ⌊32.3/14.3⌋=2 × ⌊47.6/21.9⌋=2 = 4. Girada: ⌊32.3/21.9⌋=1 × ⌊47.6/14.3⌋=3 = 3.
    expect(acomodar(14, 21.6, MESA)).toEqual({ piezasPorHoja: 4, columnas: 2, filas: 2, rotada: false });
  });

  it("el giro gana: tarjeta 9 × 5 en tabloide da 20 girada en vez de 16", () => {
    // Normal: ⌊27.2/9.3⌋=2 × ⌊42.5/5.3⌋=8 = 16. Girada: ⌊27.2/5.3⌋=5 × ⌊42.5/9.3⌋=4 = 20.
    expect(acomodar(9, 5)).toEqual({ piezasPorHoja: 20, columnas: 5, filas: 4, rotada: true });
  });

  it("en empate se queda la normal", () => {
    // Pieza cuadrada 10 × 10: ⌊27.2/10.3⌋=2 × ⌊42.5/10.3⌋=4 = 8 en ambos sentidos.
    expect(acomodar(10, 10)).toEqual({ piezasPorHoja: 8, columnas: 2, filas: 4, rotada: false });
  });

  it("pieza que no cabe: cartel tabloide en hoja tabloide da 0", () => {
    expect(acomodar(27.9, 43.2)).toEqual({ piezasPorHoja: 0, columnas: 0, filas: 0, rotada: false });
  });

  it("el mismo cartel sí cabe en mesa", () => {
    expect(acomodar(27.9, 43.2, MESA)).toEqual({ piezasPorHoja: 1, columnas: 1, filas: 1, rotada: false });
  });

  it("pieza exacta al área útil cabe una vez", () => {
    expect(acomodar(26.9, 42.2)).toEqual({ piezasPorHoja: 1, columnas: 1, filas: 1, rotada: false });
  });

  it("dos piezas exactas con separación caben sin error de punto flotante", () => {
    // (26.9 − 0.3) ÷ 2 = 13.3 → 2 columnas exactas.
    expect(acomodar(13.3, 42.2).columnas).toBe(2);
  });

  it("un margen mayor que la hoja no da piezas negativas", () => {
    expect(calcularAcomodo({ anchoCm: 1, altoCm: 1 }, { anchoCm: 2, altoCm: 3 }, 2, 0.3).piezasPorHoja).toBe(0);
  });
});
