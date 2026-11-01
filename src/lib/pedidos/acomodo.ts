// Cálculo de acomodo: cuántas piezas caben en una hoja de impresión en cuadrícula.
// Puro y compartido por cliente (presupuesto en vivo) y servidor (el que manda).

export interface Medidas {
  anchoCm: number;
  altoCm: number;
}

export interface Acomodo {
  piezasPorHoja: number; // 0 = no cabe
  columnas: number;
  filas: number;
  rotada: boolean; // la pieza se giró 90° para acomodar más
}

const NO_CABE: Acomodo = { piezasPorHoja: 0, columnas: 0, filas: 0, rotada: false };

// Se trabaja en centésimas de milímetro enteras para que divisiones exactas
// (p. ej. una pieza igual al área útil) no den 0.999… por punto flotante.
const UNIDADES_POR_CM = 1000;
const aUnidades = (cm: number) => Math.round(cm * UNIDADES_POR_CM);

/** Piezas por eje: ⌊(útil + separación) ÷ (pieza + separación)⌋. */
function piezasPorEje(util: number, pieza: number, separacion: number): number {
  if (util <= 0 || pieza <= 0) return 0;
  return Math.floor((util + separacion) / (pieza + separacion));
}

function cuadricula(
  piezaAncho: number,
  piezaAlto: number,
  utilAncho: number,
  utilAlto: number,
  separacion: number,
): { columnas: number; filas: number } {
  return {
    columnas: piezasPorEje(utilAncho, piezaAncho, separacion),
    filas: piezasPorEje(utilAlto, piezaAlto, separacion),
  };
}

/**
 * Acomoda la pieza en la hoja (orientación vertical) con margen y separación.
 * Prueba la pieza normal y girada 90° y se queda con la que da más piezas;
 * en empate, la normal.
 */
export function calcularAcomodo(
  pieza: Medidas,
  hoja: Medidas,
  margenCm: number,
  separacionCm: number,
): Acomodo {
  const margen = aUnidades(margenCm);
  const separacion = aUnidades(separacionCm);
  const utilAncho = aUnidades(hoja.anchoCm) - 2 * margen;
  const utilAlto = aUnidades(hoja.altoCm) - 2 * margen;
  const ancho = aUnidades(pieza.anchoCm);
  const alto = aUnidades(pieza.altoCm);

  const normal = cuadricula(ancho, alto, utilAncho, utilAlto, separacion);
  const girada = cuadricula(alto, ancho, utilAncho, utilAlto, separacion);
  const piezasNormal = normal.columnas * normal.filas;
  const piezasGirada = girada.columnas * girada.filas;

  if (piezasNormal === 0 && piezasGirada === 0) return { ...NO_CABE };
  if (piezasGirada > piezasNormal) {
    return { piezasPorHoja: piezasGirada, ...girada, rotada: true };
  }
  return { piezasPorHoja: piezasNormal, ...normal, rotada: false };
}
