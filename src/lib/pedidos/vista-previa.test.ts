import { describe, expect, it } from "vitest";
import { calcularAcomodo } from "./acomodo";
import { geometriaHoja, leyendaHoja } from "./vista-previa";

const TABLOIDE = { anchoCm: 27.9, altoCm: 43.2 };
const MESA = { anchoCm: 33, altoCm: 48.3 };
const MEDIA_CARTA = { anchoCm: 14, altoCm: 21.6 };

const geometria = (hoja: typeof TABLOIDE, pieza: typeof MEDIA_CARTA) =>
  geometriaHoja(hoja, pieza, calcularAcomodo(pieza, hoja, 0.5, 0.3), 0.5, 0.3);

/** Todas las piezas dentro del área útil y sin encimarse. */
function expectDentroYSinEncimar(g: ReturnType<typeof geometriaHoja>) {
  const eps = 1e-6;
  for (const p of g.piezas) {
    expect(p.x).toBeGreaterThanOrEqual(g.util.x - eps);
    expect(p.y).toBeGreaterThanOrEqual(g.util.y - eps);
    expect(p.x + p.ancho).toBeLessThanOrEqual(g.util.x + g.util.ancho + eps);
    expect(p.y + p.alto).toBeLessThanOrEqual(g.util.y + g.util.alto + eps);
  }
  for (const [i, a] of g.piezas.entries()) {
    for (const b of g.piezas.slice(i + 1)) {
      const separadas =
        a.x + a.ancho <= b.x + eps || b.x + b.ancho <= a.x + eps || a.y + a.alto <= b.y + eps || b.y + b.alto <= a.y + eps;
      expect(separadas).toBe(true);
    }
  }
}

describe("geometriaHoja", () => {
  it("hoja y área útil en milímetros", () => {
    const g = geometria(MESA, MEDIA_CARTA);
    expect(g.hoja).toEqual({ x: 0, y: 0, ancho: 330, alto: 483 });
    expect(g.util).toEqual({ x: 5, y: 5, ancho: 320, alto: 473 });
  });

  it("media carta en mesa: 4 piezas sin girar (140 × 216 mm) separadas 3 mm", () => {
    const g = geometria(MESA, MEDIA_CARTA);
    expect(g.piezas).toHaveLength(4);
    expect(g.pieza).toEqual({ ancho: 140, alto: 216 });
    expect(g.piezas[1].x - g.piezas[0].x).toBe(143);
    expect(g.piezas[2].y - g.piezas[0].y).toBe(219);
    expectDentroYSinEncimar(g);
  });

  it("media carta en tabloide: 2 piezas giradas (216 × 140 mm) una sobre otra", () => {
    const g = geometria(TABLOIDE, MEDIA_CARTA);
    expect(g.piezas).toHaveLength(2);
    expect(g.pieza).toEqual({ ancho: 216, alto: 140 });
    expect(g.piezas[0].x).toBe(g.piezas[1].x);
    expectDentroYSinEncimar(g);
  });

  it("la cuadrícula queda centrada en el área útil", () => {
    const g = geometria(MESA, MEDIA_CARTA);
    const izquierda = g.piezas[0].x - g.util.x;
    const derecha = g.util.x + g.util.ancho - (g.piezas[1].x + g.pieza.ancho);
    expect(izquierda).toBeCloseTo(derecha);
  });

  it("muchas piezas pequeñas caben sin encimarse", () => {
    const g = geometria(TABLOIDE, { anchoCm: 9, altoCm: 5 });
    expect(g.piezas).toHaveLength(20);
    expectDentroYSinEncimar(g);
  });

  it("si no cabe no hay piezas", () => {
    expect(geometria(TABLOIDE, TABLOIDE).piezas).toEqual([]);
  });
});

describe("leyendaHoja", () => {
  it("con medidas, piezas por hoja y hojas", () => {
    expect(leyendaHoja({ nombre: "Mesa", ...MESA }, 6, 17)).toBe("Mesa 33 × 48.3 cm · 6 piezas por hoja · 17 hojas");
  });

  it("singulares y miles", () => {
    expect(leyendaHoja({ nombre: "Tabloide", ...TABLOIDE }, 1, 1)).toBe(
      "Tabloide 27.9 × 43.2 cm · 1 pieza por hoja · 1 hoja",
    );
    expect(leyendaHoja({ nombre: "Mesa", ...MESA }, 2, 1500)).toBe("Mesa 33 × 48.3 cm · 2 piezas por hoja · 1,500 hojas");
  });

  it("sin hojas cuando aún no hay cantidad", () => {
    expect(leyendaHoja({ nombre: "Mesa", ...MESA }, 4)).toBe("Mesa 33 × 48.3 cm · 4 piezas por hoja");
  });
});
