import type { Catalogo, Producto } from "@/lib/catalogo/schema";
import type { ItemData, Tamano } from "@/lib/validation/pedidos";
import { calcularAcomodo, type Medidas } from "./acomodo";
import { calcularPresupuestoItem, type PresupuestoItem } from "./presupuesto";

// Evaluación de un ítem contra el catálogo vigente. Pura y compartida: el editor
// la usa para el presupuesto en vivo y el servidor para validar, guardar y
// marcar `problema` cuando el catálogo cambió.

export type CampoItem = "productoId" | "tamano" | "papelId" | "hojaId";

export type EvaluacionItem =
  | { ok: true; anchoCm: number; altoCm: number; presupuesto: PresupuestoItem }
  | { ok: false; campo: CampoItem; mensaje: string; noCabe: boolean };

type DatosEvaluables = Pick<ItemData, "productoId" | "tamano" | "papelId" | "hojaId" | "cantidad">;

/** Medidas del tamaño: las del predefinido del producto o las personalizadas. */
export function medidasDelTamano(producto: Producto, tamano: Tamano): Medidas | null {
  if (tamano.tipo === "personalizado") return { anchoCm: tamano.anchoCm, altoCm: tamano.altoCm };
  const predefinido = producto.tamanos.find((t) => t.id === tamano.tamanoId);
  return predefinido ? { anchoCm: predefinido.anchoCm, altoCm: predefinido.altoCm } : null;
}

/** "No cabe en Tabloide; sí cabe en Mesa" o "No cabe en Tabloide ni en ninguna otra hoja". */
export function mensajeNoCabe(catalogo: Catalogo, pieza: Medidas, hojaId: string): string {
  const hoja = catalogo.hojas.find((h) => h.id === hojaId);
  const alternativas = catalogo.hojas
    .filter((h) => h.id !== hojaId)
    .filter((h) => calcularAcomodo(pieza, h, catalogo.margenCm, catalogo.separacionCm).piezasPorHoja > 0)
    .map((h) => h.nombre);
  const enHoja = `No cabe en ${hoja?.nombre ?? hojaId}`;
  if (alternativas.length === 0) return `${enHoja} ni en ninguna otra hoja`;
  return `${enHoja}; sí cabe en ${alternativas.join(" o ")}`;
}

export function evaluarItem(catalogo: Catalogo, item: DatosEvaluables): EvaluacionItem {
  const falla = (campo: CampoItem, mensaje: string, noCabe = false): EvaluacionItem => ({
    ok: false,
    campo,
    mensaje,
    noCabe,
  });

  const producto = catalogo.productos.find((p) => p.id === item.productoId);
  if (!producto) return falla("productoId", "El producto ya no existe en el catálogo");

  const pieza = medidasDelTamano(producto, item.tamano);
  if (!pieza) return falla("tamano", "El tamaño ya no existe en el catálogo");

  const papel = catalogo.papeles.find((p) => p.id === item.papelId);
  if (!papel) return falla("papelId", "El papel ya no existe en el catálogo");
  if (!producto.papelesIds.includes(papel.id)) {
    return falla("papelId", `El papel ${papel.nombre} no está disponible para ${producto.nombre}`);
  }

  const hoja = catalogo.hojas.find((h) => h.id === item.hojaId);
  const precioHojaCentavos = hoja && papel.precioHojaCentavos[hoja.id];
  if (!hoja || precioHojaCentavos === undefined) {
    return falla("hojaId", "La hoja ya no existe en el catálogo");
  }

  const presupuesto = calcularPresupuestoItem({
    pieza,
    hoja,
    cantidad: item.cantidad,
    precioHojaCentavos,
    margenCm: catalogo.margenCm,
    separacionCm: catalogo.separacionCm,
  });
  if (presupuesto.acomodo.piezasPorHoja === 0) {
    return falla("hojaId", mensajeNoCabe(catalogo, pieza, hoja.id), true);
  }

  return { ok: true, anchoCm: pieza.anchoCm, altoCm: pieza.altoCm, presupuesto };
}
