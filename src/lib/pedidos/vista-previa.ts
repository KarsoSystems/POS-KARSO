import type { Acomodo, Medidas } from "./acomodo";

// Geometría de la vista previa, en milímetros (el viewBox del SVG). Pura para
// poder probarla sin navegador.

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface GeometriaHoja {
  hoja: Rect; // 0, 0, ancho, alto de la hoja
  util: Rect; // área imprimible (sin margen)
  /** Tamaño de cada pieza ya acomodada (con el giro aplicado). */
  pieza: { ancho: number; alto: number };
  piezas: Rect[];
}

const mm = (cm: number) => Math.round(cm * 100) / 10; // 0.1 mm de precisión

/**
 * Posiciones de las piezas según el acomodo: cuadrícula de columnas × filas,
 * separadas por `separacionCm` y centrada dentro del área útil.
 */
export function geometriaHoja(
  hoja: Medidas,
  pieza: Medidas,
  acomodo: Acomodo,
  margenCm: number,
  separacionCm: number,
): GeometriaHoja {
  const margen = mm(margenCm);
  const separacion = mm(separacionCm);
  const util: Rect = {
    x: margen,
    y: margen,
    ancho: mm(hoja.anchoCm) - 2 * margen,
    alto: mm(hoja.altoCm) - 2 * margen,
  };
  const ancho = mm(acomodo.rotada ? pieza.altoCm : pieza.anchoCm);
  const alto = mm(acomodo.rotada ? pieza.anchoCm : pieza.altoCm);

  const { columnas, filas } = acomodo;
  const anchoGrid = columnas * ancho + Math.max(0, columnas - 1) * separacion;
  const altoGrid = filas * alto + Math.max(0, filas - 1) * separacion;
  const x0 = util.x + (util.ancho - anchoGrid) / 2;
  const y0 = util.y + (util.alto - altoGrid) / 2;

  const piezas: Rect[] = [];
  for (let fila = 0; fila < filas; fila++) {
    for (let columna = 0; columna < columnas; columna++) {
      piezas.push({
        x: x0 + columna * (ancho + separacion),
        y: y0 + fila * (alto + separacion),
        ancho,
        alto,
      });
    }
  }

  return {
    hoja: { x: 0, y: 0, ancho: mm(hoja.anchoCm), alto: mm(hoja.altoCm) },
    util,
    pieza: { ancho, alto },
    piezas,
  };
}

/** "Mesa 33 × 48.3 cm · 4 piezas por hoja · 250 hojas" (las hojas solo si se conocen). */
export function leyendaHoja(
  hoja: { nombre: string; anchoCm: number; altoCm: number },
  piezasPorHoja: number,
  hojas?: number,
): string {
  const cm = (n: number) => String(Math.round(n * 100) / 100);
  const partes = [
    `${hoja.nombre} ${cm(hoja.anchoCm)} × ${cm(hoja.altoCm)} cm`,
    `${piezasPorHoja} ${piezasPorHoja === 1 ? "pieza" : "piezas"} por hoja`,
  ];
  if (hojas !== undefined) partes.push(`${hojas.toLocaleString("es-MX")} ${hojas === 1 ? "hoja" : "hojas"}`);
  return partes.join(" · ");
}
