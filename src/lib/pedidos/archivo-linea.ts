import type { Producto, ReglasArchivo, Variante } from "@/lib/catalogo/schema";
import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import type { ArchivosLineaData, ExtensionPermitida } from "@/lib/validation/pedidos";

// Validación de los archivos de una línea (KARSO-PROMPT-v1.md 5.7). Pura y
// compartida: el editor la usa en vivo y el servidor al guardar y al recalcular.
// Ninguna regla bloquea: cada una que falla agrega una advertencia y la línea se
// guarda con `validado: false`. La decisión final la toma mostrador (SPEC 07).

export type { ExtensionPermitida };
export type ColorArchivo = "CMYK" | "RGB" | "otro";

/** Lo que el servidor extrae del archivo al confirmarlo. */
export interface MetadatosArchivo {
  tipo: "imagen" | "vector";
  legible: boolean;
  anchoPx: number | null;
  altoPx: number | null;
  color: ColorArchivo | null;
}

export interface ArchivoAValidar {
  extension: string;
  bytes: number;
  metadatos: MetadatosArchivo | null;
}

/** Medida física que debe tener el archivo, ya con rebase, en la unidad de la variante. */
export interface MedidaEsperada {
  unidad: "cm" | "m";
  ancho: number;
  alto: number;
  tolerancia: number;
  permiteGirar: boolean;
}

export type CodigoAdvertencia = "formato" | "peso" | "ilegible" | "color" | "resolucion" | "medida";

export interface Advertencia {
  codigo: CodigoAdvertencia;
  mensaje: string;
}

export interface ValidacionArchivo {
  resolucion: number | null; // dpi efectivos redondeados; null en vectores, ilegibles o sin medida
  validado: boolean;
  advertencias: Advertencia[];
}

const BYTES_POR_MB = 1024 * 1024;
const EPSILON = 1e-9;

/** Peso en MB con 1 decimal. */
export const pesoMB = (bytes: number): number => Math.round((bytes / BYTES_POR_MB) * 10) / 10;

/** Reglas del producto con las sobrescrituras de la variante. */
export function reglasDe(producto: Pick<Producto, "archivo">, variante: Pick<Variante, "archivo">): ReglasArchivo {
  return { ...producto.archivo, ...variante.archivo };
}

/**
 * Medida esperada de la pieza (la de `resolverMedida`) más el rebase por lado.
 * En metro lineal, `medida.ancho` ya es el ancho fijo y `medida.alto` el largo.
 */
export function medidaEsperadaDe(
  variante: Pick<Variante, "medida">,
  medida: { ancho: number; alto: number },
): MedidaEsperada {
  const { unidad, rebase, tolerancia, permiteGirar } = variante.medida;
  // En mm enteros, como cotizacion.ts: 8.7 + 2 × 0.3 da 9.3 y no 9.299999999999999.
  const mmPorUnidad = unidad === "m" ? 1000 : 10;
  const conRebase = (v: number) => Math.round((v + 2 * rebase) * mmPorUnidad) / mmPorUnidad;
  return { unidad, ancho: conRebase(medida.ancho), alto: conRebase(medida.alto), tolerancia, permiteGirar };
}

const fmtMedida = (valor: number, unidad: "cm" | "m") => valor.toFixed(unidad === "m" ? 2 : 1);
const aCm = (valor: number, unidad: "cm" | "m") => (unidad === "m" ? valor * 100 : valor);

/** "JPG, JPEG y TIFF". */
function listaFormatos(formatos: string[]): string {
  const nombres = formatos.map((f) => f.toUpperCase());
  return nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

interface Orientacion {
  ancho: number;
  alto: number;
  corresponde: boolean;
  altoArchivo: number; // lo que mide el archivo de alto a la escala de `ancho`
  dpi: number;
}

function orientacion(anchoPx: number, altoPx: number, ancho: number, alto: number, esperada: MedidaEsperada): Orientacion {
  const escala = anchoPx / ancho; // px por unidad
  const altoArchivo = altoPx / escala;
  return {
    ancho,
    alto,
    corresponde: Math.abs(altoArchivo - alto) <= esperada.tolerancia + EPSILON,
    altoArchivo,
    dpi: Math.round(escala * (esperada.unidad === "m" ? 0.0254 : 2.54)),
  };
}

/**
 * Advertencias del archivo contra las reglas. `medidaEsperada` es null cuando la
 * línea aún no tiene medida (variable sin capturar); entonces no se revisan medida
 * ni resolución. Los vectores solo se revisan por formato y peso.
 */
export function validarArchivo(
  reglas: ReglasArchivo,
  medidaEsperada: MedidaEsperada | null,
  archivo: ArchivoAValidar,
): ValidacionArchivo {
  const advertencias: Advertencia[] = [];
  const extension = archivo.extension.toLowerCase();
  let resolucion: number | null = null;

  if (!reglas.formatos.includes(extension)) {
    advertencias.push({
      codigo: "formato",
      mensaje: `Formato ${extension.toUpperCase()} no permitido para este producto; se aceptan ${listaFormatos(reglas.formatos)}`,
    });
  }
  if (archivo.bytes > reglas.pesoMaximoMB * BYTES_POR_MB) {
    advertencias.push({
      codigo: "peso",
      mensaje: `Pesa ${pesoMB(archivo.bytes).toFixed(1)} MB; el máximo es ${reglas.pesoMaximoMB} MB`,
    });
  }

  const metadatos = archivo.metadatos;
  if (metadatos?.tipo === "imagen") {
    const { anchoPx, altoPx } = metadatos;
    if (!metadatos.legible || anchoPx === null || altoPx === null) {
      advertencias.push({ codigo: "ilegible", mensaje: "No se pudo leer la imagen; mostrador la revisará" });
    } else {
      if (reglas.colorRequerido !== "cualquiera" && metadatos.color !== reglas.colorRequerido) {
        const actual = metadatos.color === "otro" || metadatos.color === null ? "otro espacio de color" : metadatos.color;
        advertencias.push({ codigo: "color", mensaje: `El archivo está en ${actual}; se requiere ${reglas.colorRequerido}` });
      }
      if (reglas.validarMedida && medidaEsperada) {
        const { ancho: W, alto: H, unidad } = medidaEsperada;
        const opciones = [orientacion(anchoPx, altoPx, W, H, medidaEsperada)];
        if (medidaEsperada.permiteGirar) opciones.push(orientacion(anchoPx, altoPx, H, W, medidaEsperada));
        const usada = opciones.find((o) => o.corresponde) ?? opciones[0];
        resolucion = usada.dpi;

        if (usada.dpi < reglas.resolucionMinima) {
          const minimoPx = (v: number) => Math.round((aCm(v, unidad) / 2.54) * reglas.resolucionMinima);
          advertencias.push({
            codigo: "resolucion",
            mensaje:
              `Resolución efectiva de ${usada.dpi} dpi; se requieren al menos ${reglas.resolucionMinima} dpi ` +
              `(mínimo ${minimoPx(usada.ancho)} × ${minimoPx(usada.alto)} px)`,
          });
        }
        if (!usada.corresponde) {
          const f = (v: number) => fmtMedida(v, unidad);
          advertencias.push({
            codigo: "medida",
            mensaje:
              `La medida no corresponde: a ${f(usada.ancho)} ${unidad} de ancho el archivo mide ` +
              `${f(usada.ancho)} × ${f(usada.altoArchivo)} ${unidad}; se esperaba ${f(usada.ancho)} × ${f(usada.alto)} ${unidad} ` +
              `(± ${f(medidaEsperada.tolerancia)} ${unidad})`,
          });
        }
      }
    }
  }

  return { resolucion, validado: advertencias.length === 0, advertencias };
}

// ── Caras de la línea ────────────────────────────────────────────────────────

/** Lo que la línea copia de cada archivo al guardarse (KARSO 6.5), con su validación. */
export interface ArchivoLinea {
  archivoId: string;
  nombreOriginal: string;
  formato: ExtensionPermitida;
  color: ColorArchivo | null;
  anchoPx: number | null;
  altoPx: number | null;
  resolucion: number | null;
  pesoMB: number;
  validado: boolean;
  advertencias: Advertencia[];
  subidoEn: string;
}

export type ReversoLinea =
  | ({ tipo: "archivo" } & ArchivoLinea)
  | { tipo: "calendario"; anio: number }
  | { tipo: "texto"; texto: string };

export interface ArchivosLinea {
  frente: ArchivoLinea | null;
  reverso: ReversoLinea | null;
}

/** Datos públicos del archivo que hacen falta para la línea (subconjunto de PublicArchivo). */
export interface ArchivoDisponible {
  id: string;
  nombreOriginal: string;
  extension: ExtensionPermitida;
  bytes: number;
  estado: "pendiente" | "subido";
  metadatos: MetadatosArchivo | null;
  subidoEn: string | null;
}

export type CampoArchivos = "archivos.frente" | "archivos.reverso";

export type EvaluacionArchivos =
  | { ok: true; archivos: ArchivosLinea }
  | { ok: false; campo: CampoArchivos; mensaje: string };

/** Años que se pueden elegir para el calendario del reverso: el actual y el siguiente, en la zona de la tienda. */
export function aniosCalendario(ahora: Date = new Date()): [number, number] {
  const actual = Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA_TIENDA, year: "numeric" }).format(ahora));
  return [actual, actual + 1];
}

/** El archivo con sus datos y advertencias, o el mensaje de por qué no se puede usar. */
export function archivoDeLinea(
  id: string,
  disponibles: Record<string, ArchivoDisponible>,
  reglas: ReglasArchivo,
  medida: MedidaEsperada | null,
): { ok: true; archivo: ArchivoLinea } | { ok: false; mensaje: string } {
  // Un archivo de otro usuario no llega en `disponibles`: responde igual que uno inexistente.
  const archivo = disponibles[id];
  if (!archivo) return { ok: false, mensaje: "El archivo no existe" };
  if (archivo.estado !== "subido" || !archivo.subidoEn) return { ok: false, mensaje: "El archivo aún no termina de subirse" };

  const { resolucion, validado, advertencias } = validarArchivo(reglas, medida, archivo);
  const meta = archivo.metadatos;
  return {
    ok: true,
    archivo: {
      archivoId: archivo.id,
      nombreOriginal: archivo.nombreOriginal,
      formato: archivo.extension,
      color: meta?.color ?? null,
      anchoPx: meta?.anchoPx ?? null,
      altoPx: meta?.altoPx ?? null,
      resolucion,
      pesoMB: pesoMB(archivo.bytes),
      validado,
      advertencias,
      subidoEn: archivo.subidoEn,
    },
  };
}

/**
 * Frente y reverso de la línea según `requiereArchivo` y `caras.reverso`. Los
 * errores de estructura bloquean (la línea no tendría sentido); lo que no cumple
 * las reglas del archivo solo advierte. Se usa al guardar y al recalcular: un
 * calendario de un año que ya pasó deja de ser válido.
 */
export function evaluarArchivos(
  producto: Pick<Producto, "archivo">,
  variante: Pick<Variante, "archivo" | "caras" | "medida">,
  medida: { ancho: number; alto: number },
  entrada: ArchivosLineaData,
  disponibles: Record<string, ArchivoDisponible>,
  ahora: Date = new Date(),
): EvaluacionArchivos {
  const reglas = reglasDe(producto, variante);
  const esperada = medidaEsperadaDe(variante, medida);

  let frente: ArchivoLinea | null = null;
  if (entrada.frente) {
    const resultado = archivoDeLinea(entrada.frente, disponibles, reglas, esperada);
    if (!resultado.ok) return { ok: false, campo: "archivos.frente", mensaje: resultado.mensaje };
    frente = resultado.archivo;
  } else if (reglas.requiereArchivo) {
    return { ok: false, campo: "archivos.frente", mensaje: "Sube el archivo que quieres imprimir" };
  }

  const falla = (mensaje: string): EvaluacionArchivos => ({ ok: false, campo: "archivos.reverso", mensaje });
  const { reverso: caraReverso } = variante.caras;
  let reverso: ReversoLinea | null = null;
  if (entrada.reverso && caraReverso === "no_aplica") return falla("Este producto no lleva reverso");
  if (!entrada.reverso && caraReverso === "obligatorio") return falla("Elige el reverso");

  switch (entrada.reverso?.tipo) {
    case undefined:
      break;
    case "archivo": {
      const resultado = archivoDeLinea(entrada.reverso.archivoId, disponibles, reglas, esperada);
      if (!resultado.ok) return falla(resultado.mensaje);
      reverso = { tipo: "archivo", ...resultado.archivo };
      break;
    }
    case "calendario": {
      const anios = aniosCalendario(ahora);
      if (!anios.includes(entrada.reverso.anio)) return falla(`Elige el calendario de ${anios[0]} o ${anios[1]}`);
      reverso = { tipo: "calendario", anio: entrada.reverso.anio };
      break;
    }
    case "texto":
      reverso = { tipo: "texto", texto: entrada.reverso.texto };
      break;
  }

  return { ok: true, archivos: { frente, reverso } };
}

/** Ids de los archivos que usa la línea (frente y reverso de tipo archivo). */
export function idsDeArchivos(archivos: ArchivosLinea): string[] {
  const ids = archivos.frente ? [archivos.frente.archivoId] : [];
  if (archivos.reverso?.tipo === "archivo") ids.push(archivos.reverso.archivoId);
  return ids;
}

/** La entrada (`lineaSchema.archivos`) que corresponde a las caras guardadas, para volver a evaluarlas. */
export function entradaDeArchivos(archivos: ArchivosLinea): ArchivosLineaData {
  const { frente, reverso } = archivos;
  return {
    frente: frente?.archivoId ?? null,
    reverso:
      reverso === null
        ? null
        : reverso.tipo === "archivo"
          ? { tipo: "archivo", archivoId: reverso.archivoId }
          : reverso,
  };
}
