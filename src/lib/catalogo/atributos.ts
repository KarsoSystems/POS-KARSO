import type { Variante } from "@/lib/catalogo/schema";

// Selectores del editor armados con los `atributos` de las variantes de un
// producto (KARSO-PROMPT-v1.md 5.2). Puro: el editor lo recalcula en cada cambio.
//
// - Los atributos van en el orden de las llaves de la primera variante.
// - Una opción está disponible si existe una variante con ella y con las
//   elecciones anteriores; si no, se muestra deshabilitada con su motivo.
// - Una elección que deja de combinar se borra; una opción única se preselecciona.

const ETIQUETAS: Record<string, string> = {
  tamano: "Tamaño",
  ajuste: "Ajuste",
  papel: "Papel",
  presentacion: "Presentación",
  acabadoBase: "Acabado base",
  calidad: "Calidad",
  entrega: "Entrega",
  copias: "Copias",
};

/** Etiqueta visible de un atributo; una llave desconocida se muestra capitalizada. */
export function etiquetaAtributo(llave: string): string {
  return ETIQUETAS[llave] ?? llave.charAt(0).toUpperCase() + llave.slice(1);
}

export type Elecciones = Record<string, string>;

export interface OpcionAtributo {
  valor: string;
  disponible: boolean;
  motivo: string | null; // "No disponible para Tríptico"
}

export interface SelectorAtributo {
  llave: string;
  etiqueta: string;
  opciones: OpcionAtributo[];
  elegido: string | null;
}

export interface EstadoSelectores {
  selectores: SelectorAtributo[];
  /** Elecciones normalizadas: sin las que dejaron de combinar y con las opciones únicas. */
  elecciones: Elecciones;
  /** La variante elegida cuando todos los selectores tienen valor; si no, null. */
  variante: Variante | null;
}

/** Llaves de atributos: las de la primera variante y, después, las que solo traen otras. */
export function llavesAtributos(variantes: Variante[]): string[] {
  const llaves: string[] = [];
  for (const v of variantes) for (const llave of Object.keys(v.atributos)) if (!llaves.includes(llave)) llaves.push(llave);
  return llaves;
}

/** Valores de un atributo en orden de aparición. */
function valoresDe(variantes: Variante[], llave: string): string[] {
  const valores: string[] = [];
  for (const v of variantes) {
    const valor = v.atributos[llave];
    if (valor !== undefined && !valores.includes(valor)) valores.push(valor);
  }
  return valores;
}

/** La elección anterior que deja fuera a `valor`: la primera tras la cual ninguna variante lo tiene. */
function motivoNoDisponible(
  variantes: Variante[],
  anteriores: [string, string][],
  llave: string,
  valor: string,
): string | null {
  let candidatas = variantes;
  for (const [llaveAnterior, elegido] of anteriores) {
    candidatas = candidatas.filter((v) => v.atributos[llaveAnterior] === elegido);
    if (!candidatas.some((v) => v.atributos[llave] === valor)) return `No disponible para ${elegido}`;
  }
  return null;
}

export function resolverSelectores(variantes: Variante[], elecciones: Elecciones): EstadoSelectores {
  const selectores: SelectorAtributo[] = [];
  const normalizadas: Elecciones = {};
  const anteriores: [string, string][] = [];
  let candidatas = variantes;

  for (const llave of llavesAtributos(variantes)) {
    // Si ninguna variante que combina tiene esta llave, el atributo no aplica (p. ej. la credencial PVC no tiene acabado base).
    if (!candidatas.some((v) => llave in v.atributos)) continue;

    const opciones = valoresDe(variantes, llave).map((valor) => {
      const disponible = candidatas.some((v) => v.atributos[llave] === valor);
      return { valor, disponible, motivo: disponible ? null : motivoNoDisponible(variantes, anteriores, llave, valor) };
    });
    const disponibles = opciones.filter((o) => o.disponible);

    let elegido: string | null = elecciones[llave] ?? null;
    if (elegido !== null && !disponibles.some((o) => o.valor === elegido)) elegido = null;
    if (elegido === null && disponibles.length === 1) elegido = disponibles[0].valor;

    selectores.push({ llave, etiqueta: etiquetaAtributo(llave), opciones, elegido });
    if (elegido !== null) {
      normalizadas[llave] = elegido;
      anteriores.push([llave, elegido]);
      candidatas = candidatas.filter((v) => v.atributos[llave] === elegido);
    }
  }

  const completo = selectores.every((s) => s.elegido !== null);
  return { selectores, elecciones: normalizadas, variante: completo ? (candidatas[0] ?? null) : null };
}

/** Cambia una elección; las posteriores que dejan de combinar se borran al resolver. */
export function elegirAtributo(
  variantes: Variante[],
  elecciones: Elecciones,
  llave: string,
  valor: string,
): Elecciones {
  return resolverSelectores(variantes, { ...elecciones, [llave]: valor }).elecciones;
}

/** Elecciones que llevan a una variante (para precargar el editor al editar una línea). */
export function eleccionesDeVariante(variante: Pick<Variante, "atributos">): Elecciones {
  return { ...variante.atributos };
}
