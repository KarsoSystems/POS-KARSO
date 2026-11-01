import { describe, expect, it } from "vitest";
import { calcularPresupuestoItem, calcularTotales } from "./presupuesto";

// Valores del catálogo de ejemplo.
const TABLOIDE = { anchoCm: 27.9, altoCm: 43.2 };
const MESA = { anchoCm: 33, altoCm: 48.3 };
const MEDIA_CARTA = { anchoCm: 14, altoCm: 21.6 };
const COUCHE_150 = { tabloide: 500, mesa: 650 };

const presupuestar = (cantidad: number, hoja = TABLOIDE, precioHojaCentavos = COUCHE_150.tabloide) =>
  calcularPresupuestoItem({
    pieza: MEDIA_CARTA,
    hoja,
    cantidad,
    precioHojaCentavos,
    margenCm: 0.5,
    separacionCm: 0.3,
  });

const conSubtotales = (...subtotales: number[]) =>
  subtotales.map((subtotalCentavos) => ({ presupuesto: { subtotalCentavos } }));

describe("calcularPresupuestoItem", () => {
  it("1,000 volantes media carta couché 150 en tabloide: 500 hojas y $2,500.00", () => {
    const p = presupuestar(1000);
    expect(p.acomodo.piezasPorHoja).toBe(2);
    expect(p.hojas).toBe(500);
    expect(p.precioHojaCentavos).toBe(500);
    expect(p.subtotalCentavos).toBe(250_000);
  });

  it("los mismos en mesa: 250 hojas y $1,625.00", () => {
    const p = presupuestar(1000, MESA, COUCHE_150.mesa);
    expect(p.hojas).toBe(250);
    expect(p.subtotalCentavos).toBe(162_500);
  });

  it("las hojas se redondean hacia arriba", () => {
    // 1,001 piezas a 2 por hoja → 501 hojas; 1 pieza → 1 hoja.
    expect(presupuestar(1001).hojas).toBe(501);
    expect(presupuestar(1).hojas).toBe(1);
    // 5 piezas a 4 por hoja en mesa → 2 hojas.
    expect(presupuestar(5, MESA, COUCHE_150.mesa).hojas).toBe(2);
  });

  it("cantidad múltiplo exacto de piezas por hoja no agrega hoja extra", () => {
    expect(presupuestar(8, MESA, COUCHE_150.mesa).hojas).toBe(2);
    expect(presupuestar(1000, MESA, COUCHE_150.mesa).hojas).toBe(250);
  });

  it("si la pieza no cabe, hojas y subtotal son 0", () => {
    const p = calcularPresupuestoItem({
      pieza: TABLOIDE,
      hoja: TABLOIDE,
      cantidad: 10,
      precioHojaCentavos: 800,
      margenCm: 0.5,
      separacionCm: 0.3,
    });
    expect(p.acomodo.piezasPorHoja).toBe(0);
    expect(p.hojas).toBe(0);
    expect(p.subtotalCentavos).toBe(0);
  });
});

describe("calcularTotales", () => {
  it("subtotal $2,500.00 → IVA $400.00 y total $2,900.00", () => {
    expect(calcularTotales(conSubtotales(250_000), 0.16)).toEqual({
      subtotalCentavos: 250_000,
      ivaCentavos: 40_000,
      totalCentavos: 290_000,
      tasaIva: 0.16,
    });
  });

  it("el IVA se redondea al centavo más cercano", () => {
    expect(calcularTotales(conSubtotales(1003), 0.16).ivaCentavos).toBe(160); // 160.48
    expect(calcularTotales(conSubtotales(1004), 0.16).ivaCentavos).toBe(161); // 160.64
  });

  it("el IVA se redondea sobre el subtotal del pedido, no por ítem", () => {
    // Por ítem serían 160 + 160 = 320; sobre 2,006 es round(320.96) = 321.
    const totales = calcularTotales(conSubtotales(1003, 1003), 0.16);
    expect(totales.subtotalCentavos).toBe(2006);
    expect(totales.ivaCentavos).toBe(321);
    expect(totales.totalCentavos).toBe(2327);
  });

  it("sin ítems todo es 0", () => {
    expect(calcularTotales([], 0.16)).toEqual({
      subtotalCentavos: 0,
      ivaCentavos: 0,
      totalCentavos: 0,
      tasaIva: 0.16,
    });
  });
});
