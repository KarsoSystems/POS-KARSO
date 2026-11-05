import type { Especificacion, TipoCobro, Variante } from "@/lib/catalogo/schema";

// Cálculo del pedido de KARSO (KARSO-PROMPT-v1.md 5.3 y 5.4). Puro y compartido:
// el editor lo usa para la cotización en vivo y el servidor recalcula y manda.
//
// Entra y sale en pesos (como el catálogo), pero por dentro todo va en centavos
// enteros y las medidas en milímetros enteros: así 2.00 × 1.50 m da 3 m² exactos
// y los ojillos no fallan por punto flotante. Cada importe se redondea una vez.

export const centavos = (pesos: number): number => Math.round(pesos * 100);
export const pesos = (centavos: number): number => centavos / 100;
const aMm = (valor: number, unidad: "cm" | "m"): number => Math.round(valor * (unidad === "m" ? 1000 : 10));
const redondear4 = (n: number): number => Math.round(n * 10_000) / 10_000;

export interface MedidaLinea {
  tipo: "fija" | "variable";
  unidad: "cm" | "m";
  ancho: number;
  alto: number; // en metro lineal, el largo
  area: number | null; // m², solo con precioPor m2
}

export interface EspecificacionLinea {
  id: number;
  nombre: string;
  tipoCobro: TipoCobro;
  precio: number;
  unidades: number; // 1, m², metros de perímetro o piezas (ojillos)
  importeUnitario: number;
}

export interface CotizacionLinea {
  medida: MedidaLinea;
  especificaciones: EspecificacionLinea[];
  importeBaseUnitario: number;
  importeEspecificacionesUnitario: number;
  importeUnitario: number;
  subtotal: number;
}

export interface DatosLinea {
  variante: Pick<Variante, "medida" | "precioPor" | "precio" | "cobroMinimo">;
  /** Solo variantes de medida variable, en la unidad de la variante. En metro lineal se usa el ancho fijo. */
  medida: { ancho: number; alto: number } | null;
  especificaciones: Especificacion[];
  cantidad: number;
}

export class CotizacionNoDisponibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CotizacionNoDisponibleError";
  }
}

/** Medidas de la pieza: las de la variante si es fija; las capturadas si es variable. */
export function resolverMedida(
  variante: Pick<Variante, "medida" | "precioPor">,
  capturada: DatosLinea["medida"],
): MedidaLinea {
  const { medida } = variante;
  if (medida.tipo === "fija") {
    return { tipo: "fija", unidad: medida.unidad, ancho: medida.ancho.min, alto: medida.alto.min, area: null };
  }
  if (!capturada) throw new CotizacionNoDisponibleError("La medida es obligatoria");
  const ancho = variante.precioPor === "metro_lineal" ? medida.ancho.min : capturada.ancho;
  return { tipo: "variable", unidad: medida.unidad, ancho, alto: capturada.alto, area: null };
}

/** Importe y unidades de una especificación por unidad de volumen, en centavos. */
function cotizarEspecificacion(e: Especificacion, anchoMm: number, altoMm: number): { unidades: number; importe: number } {
  const precio = centavos(e.precio);
  const areaMm2 = anchoMm * altoMm;
  const perimetroMm = 2 * (anchoMm + altoMm);
  switch (e.tipoCobro) {
    case "fijo":
    case "por_volumen":
      return { unidades: 1, importe: precio };
    case "por_m2":
      return { unidades: redondear4(areaMm2 / 1_000_000), importe: Math.round((precio * areaMm2) / 1_000_000) };
    case "por_metro_lineal":
      return { unidades: redondear4(perimetroMm / 1000), importe: Math.round((precio * perimetroMm) / 1000) };
    case "por_pieza": {
      // El esquema exige cadaMetros con por_pieza.
      const piezas = Math.ceil(perimetroMm / aMm(e.cadaMetros!, "m"));
      return { unidades: piezas, importe: precio * piezas };
    }
  }
}

/** Cotización de una línea según `precioPor` de la variante y las especificaciones elegidas. */
export function calcularLinea(datos: DatosLinea): CotizacionLinea {
  const { variante } = datos;
  const medida = resolverMedida(variante, datos.medida);
  const anchoMm = aMm(medida.ancho, medida.unidad);
  const altoMm = aMm(medida.alto, medida.unidad);
  const precio = centavos(variante.precio);
  const minimo = centavos(variante.cobroMinimo);

  let base: number;
  switch (variante.precioPor) {
    case "volumen":
      base = precio;
      break;
    case "m2":
      base = Math.max(Math.round((precio * anchoMm * altoMm) / 1_000_000), minimo);
      medida.area = redondear4((anchoMm * altoMm) / 1_000_000);
      break;
    case "metro_lineal":
      base = Math.max(Math.round((precio * altoMm) / 1000), minimo);
      break;
    case "cotizacion":
      throw new CotizacionNoDisponibleError("Este producto se cotiza en mostrador");
  }

  const especificaciones = datos.especificaciones.map((e) => {
    const { unidades, importe } = cotizarEspecificacion(e, anchoMm, altoMm);
    return {
      id: e.id,
      nombre: e.nombre,
      tipoCobro: e.tipoCobro,
      precio: e.precio,
      unidades,
      importeUnitario: pesos(importe),
      importe,
    };
  });
  const sumaEspecificaciones = especificaciones.reduce((suma, e) => suma + e.importe, 0);
  const unitario = base + sumaEspecificaciones;

  return {
    medida,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    especificaciones: especificaciones.map(({ importe, ...e }) => e),
    importeBaseUnitario: pesos(base),
    importeEspecificacionesUnitario: pesos(sumaEspecificaciones),
    importeUnitario: pesos(unitario),
    subtotal: pesos(unitario * datos.cantidad),
  };
}

export interface Totales {
  subtotal: number;
  descuento: number;
  baseIva: number;
  tasaIva: number;
  iva: number;
  total: number;
}

/**
 * Totales del pedido. Sin promociones ni factura todavía (SPEC 06): descuento 0 y
 * `tasaIva` 0, así que total = subtotal. El IVA se redondea una vez sobre la base.
 */
export function calcularTotales(lineas: { subtotal: number }[], tasaIva = 0, descuento = 0): Totales {
  const subtotal = lineas.reduce((suma, linea) => suma + centavos(linea.subtotal), 0);
  const baseIva = subtotal - centavos(descuento);
  const iva = Math.round(baseIva * tasaIva);
  return {
    subtotal: pesos(subtotal),
    descuento: pesos(centavos(descuento)),
    baseIva: pesos(baseIva),
    tasaIva,
    iva: pesos(iva),
    total: pesos(baseIva + iva),
  };
}
