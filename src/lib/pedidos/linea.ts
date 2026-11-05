import type { Especificacion, Producto, Variante } from "@/lib/catalogo/schema";
import type { LineaData, MedidaCapturada } from "@/lib/validation/pedidos";
import { calcularLinea, type CotizacionLinea } from "./cotizacion";

// Evaluación de una línea contra el catálogo vigente. Pura y compartida: el
// editor la usa para la cotización en vivo y el servidor para validar, guardar y
// marcar `problema` cuando el catálogo cambió.

export type CampoLinea = "productoId" | "varianteId" | "medida.ancho" | "medida.alto" | "especificaciones" | "cantidad";

/** Datos que la línea copia de la variante al guardarse (KARSO 5.4), más su cotización. */
export interface LineaCotizada extends CotizacionLinea {
  productoId: string;
  varianteId: string;
  sku: string;
  nombre: string;
  variante: string;
  atributos: Record<string, string>;
  categoria: string;
  grupoArmado: string | null;
  volumen: Variante["volumen"];
  piezasPorPaquete: number | null;
  precioPor: Variante["precioPor"];
  precioBase: number;
  cantidad: number;
  requiereArmado: boolean;
  diasEntrega: number;
}

export type EvaluacionLinea = { ok: true; linea: LineaCotizada } | { ok: false; campo: CampoLinea; mensaje: string };

type DatosEvaluables = Pick<LineaData, "productoId" | "varianteId" | "medida" | "especificaciones" | "cantidad">;

const conDosDecimales = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
const fmt = (n: number) => n.toFixed(2);

/** Error de una medida variable fuera de rango o con más de 2 decimales, o null. */
function errorDeMedida(variante: Variante, medida: MedidaCapturada | null): { campo: CampoLinea; mensaje: string } | null {
  if (variante.medida.tipo === "fija") return null;
  if (!medida) return { campo: "medida.ancho", mensaje: "Captura la medida" };

  const metroLineal = variante.precioPor === "metro_lineal";
  const ejes = metroLineal
    ? ([["alto", "El largo"]] as const)
    : ([["ancho", "El ancho"], ["alto", "El alto"]] as const);
  const { unidad } = variante.medida;

  for (const [eje, etiqueta] of ejes) {
    const valor = medida[eje];
    const { min, max } = variante.medida[eje];
    const campo = `medida.${eje}` as const;
    if (!conDosDecimales(valor)) return { campo, mensaje: `${etiqueta} admite a lo más 2 decimales` };
    if (valor < min || valor > max) {
      return { campo, mensaje: `${etiqueta} debe estar entre ${fmt(min)} y ${fmt(max)} ${unidad}` };
    }
  }
  return null;
}

/** Especificaciones elegidas, o el mensaje de la primera que ya no aplica. */
function especificacionesElegidas(
  producto: Producto,
  variante: Variante,
  ids: number[],
): { ok: true; especificaciones: Especificacion[] } | { ok: false; mensaje: string } {
  const especificaciones: Especificacion[] = [];
  for (const id of ids) {
    const e = producto.especificaciones.find((x) => x.id === id);
    if (!e) return { ok: false, mensaje: "Un acabado elegido ya no existe" };
    if (!e.activa) return { ok: false, mensaje: `El acabado ${e.nombre} ya no está disponible` };
    if (e.variantes && !e.variantes.includes(variante.varianteId)) {
      return { ok: false, mensaje: `El acabado ${e.nombre} no aplica a ${variante.nombre}` };
    }
    especificaciones.push(e);
  }
  return { ok: true, especificaciones };
}

/** Especificaciones activas que aplican a la variante (las casillas del editor). */
export function especificacionesDe(producto: Producto, varianteId: string): Especificacion[] {
  return producto.especificaciones.filter((e) => e.activa && (!e.variantes || e.variantes.includes(varianteId)));
}

export function evaluarLinea(productos: Producto[], datos: DatosEvaluables): EvaluacionLinea {
  const falla = (campo: CampoLinea, mensaje: string): EvaluacionLinea => ({ ok: false, campo, mensaje });

  const producto = productos.find((p) => p._id === datos.productoId);
  if (!producto) return falla("productoId", "El producto ya no existe en el catálogo");
  if (!producto.activo) return falla("productoId", `${producto.nombre} ya no está disponible`);

  const variante = producto.variantes.find((v) => v.varianteId === datos.varianteId);
  if (!variante) return falla("varianteId", "La variante ya no existe en el catálogo");
  if (!variante.activa) return falla("varianteId", `${variante.nombre} ya no está disponible`);
  if (!variante.canales.includes("en_linea")) return falla("varianteId", `${variante.nombre} solo se vende en mostrador`);
  if (variante.precioPor === "cotizacion") return falla("varianteId", "Este producto se cotiza en mostrador");

  const medida = errorDeMedida(variante, datos.medida);
  if (medida) return falla(medida.campo, medida.mensaje);

  const elegidas = especificacionesElegidas(producto, variante, datos.especificaciones);
  if (!elegidas.ok) return falla("especificaciones", elegidas.mensaje);

  if (datos.cantidad < variante.cantidadMinima) {
    return falla("cantidad", `La cantidad mínima es ${variante.cantidadMinima}`);
  }

  const cotizacion = calcularLinea({
    variante,
    medida: datos.medida,
    especificaciones: elegidas.especificaciones,
    cantidad: datos.cantidad,
  });

  return {
    ok: true,
    linea: {
      productoId: producto._id,
      varianteId: variante.varianteId,
      sku: variante.sku,
      nombre: producto.nombre,
      variante: variante.nombre,
      atributos: { ...variante.atributos },
      categoria: producto.categoria,
      grupoArmado: variante.grupoArmado,
      volumen: variante.volumen,
      piezasPorPaquete: variante.piezasPorPaquete,
      precioPor: variante.precioPor,
      precioBase: variante.precio,
      cantidad: datos.cantidad,
      requiereArmado: producto.requiereArmado,
      diasEntrega: variante.diasEntrega,
      ...cotizacion,
    },
  };
}
