"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { elegirAtributo, eleccionesDeVariante, resolverSelectores, type Elecciones } from "@/lib/catalogo/atributos";
import type { ReversoElegido } from "@/lib/archivos";
import type { Producto, Variante } from "@/lib/catalogo/schema";
import { aniosCalendario, medidaEsperadaDe, reglasDe, validarArchivo, type Advertencia } from "@/lib/pedidos/archivo-linea";
import { resolverMedida } from "@/lib/pedidos/cotizacion";
import { formatearM } from "@/lib/pedidos/formato";
import { especificacionesDe, evaluarLinea } from "@/lib/pedidos/linea";
import { cantidadSchema, lineaSchema, type LineaInput, type ReversoInput } from "@/lib/validation/pedidos";
import type { LineaPedido, PublicArchivo } from "@/lib/pedidos-api";
import { useAgregarItem, useBorrador, useEditarItem } from "./use-pedidos";
import { useProductos } from "./use-productos";
import { useSubirArchivo } from "./use-subir-archivo";

export interface Campos {
  productoId: string | null;
  elecciones: Elecciones;
  medida: { ancho: string; alto: string }; // texto de los inputs, en la unidad de la variante
  especificaciones: number[];
  cantidad: string;
  descripcion: string;
}

export type CampoEditor =
  | "archivos.frente"
  | "archivos.reverso"
  | "productoId"
  | "varianteId"
  | "medida.ancho"
  | "medida.alto"
  | "especificaciones"
  | "cantidad"
  | "descripcion";

export type Errores = Partial<Record<CampoEditor, string>>;

const CAMPOS: CampoEditor[] = [
  "archivos.frente",
  "archivos.reverso",
  "productoId",
  "varianteId",
  "medida.ancho",
  "medida.alto",
  "especificaciones",
  "cantidad",
  "descripcion",
];
const esCampo = (ruta: string): ruta is CampoEditor => (CAMPOS as string[]).includes(ruta);
/** Ruta de un error (zod o servidor) al campo del editor: "archivos.reverso.texto" → "archivos.reverso". */
const campoDe = (ruta: string): CampoEditor | null => {
  const campo = ruta.startsWith("archivos.reverso") ? "archivos.reverso" : ruta;
  return esCampo(campo) ? campo : null;
};

/** "1,000" o "1 000" → 1000. Vacío o inválido → NaN. */
const aEntero = (valor: string) => {
  const limpio = valor.replace(/[\s,]/g, "");
  return limpio === "" ? Number.NaN : Number(limpio);
};
/** "1.5" o "1,5" → 1.5. Vacío o inválido → NaN. */
const aDecimal = (valor: string) => {
  const limpio = valor.trim().replace(",", ".");
  return limpio === "" ? Number.NaN : Number(limpio);
};

const camposVacios = (productoId: string | null): Campos => ({
  productoId,
  elecciones: {},
  medida: { ancho: "", alto: "" },
  especificaciones: [],
  cantidad: "",
  descripcion: "",
});

function camposDeLinea(linea: LineaPedido): Campos {
  const variable = linea.medida.tipo === "variable";
  return {
    productoId: linea.productoId,
    elecciones: eleccionesDeVariante(linea),
    medida: variable ? { ancho: formatearM(linea.medida.ancho), alto: formatearM(linea.medida.alto) } : { ancho: "", alto: "" },
    especificaciones: linea.especificaciones.map((e) => e.id),
    cantidad: String(linea.cantidad),
    descripcion: linea.descripcion,
  };
}

/** Medida capturada para la API: null si la variante es fija; NaN si falta un valor. */
function medidaCapturada(variante: Variante, medida: Campos["medida"]) {
  if (variante.medida.tipo === "fija") return null;
  const ancho = variante.precioPor === "metro_lineal" ? variante.medida.ancho.min : aDecimal(medida.ancho);
  return { ancho, alto: aDecimal(medida.alto) };
}

/**
 * El reverso que aplica a la variante: ninguno con `no_aplica`; con `opcional`,
 * "sin reverso" mientras no elija otra cosa; con `obligatorio`, null hasta que elija.
 */
function reversoDe(variante: Variante | null, elegido: ReversoElegido | null): ReversoElegido | null {
  const cara = variante?.caras.reverso;
  if (!cara || cara === "no_aplica") return null;
  if (cara === "obligatorio") return elegido?.tipo === "ninguno" ? null : elegido;
  return elegido ?? { tipo: "ninguno" };
}

interface ArchivosEditor {
  frente: PublicArchivo | null;
  reverso: ReversoElegido | null; // ya resuelto con reversoDe
  archivoReverso: PublicArchivo | null;
}

function reversoInput({ reverso, archivoReverso }: ArchivosEditor): ReversoInput | null {
  switch (reverso?.tipo) {
    case undefined:
    case "ninguno":
      return null;
    case "archivo":
      return archivoReverso ? { tipo: "archivo", archivoId: archivoReverso.id } : null;
    default:
      return reverso;
  }
}

/** Lleva los campos del formulario a la forma de la API. */
function aLineaInput(campos: Campos, variante: Variante | null, archivos: ArchivosEditor): LineaInput {
  return {
    archivos: { frente: archivos.frente?.id ?? null, reverso: reversoInput(archivos) },
    descripcion: campos.descripcion,
    productoId: campos.productoId ?? "",
    varianteId: variante?.varianteId ?? "",
    medida: variante ? medidaCapturada(variante, campos.medida) : null,
    especificaciones: campos.especificaciones,
    cantidad: aEntero(campos.cantidad),
  };
}

/**
 * Estado del editor de una línea: producto, atributos, medida, archivos (frente y
 * reverso, con sus advertencias en vivo), acabados, cantidad y cotización en vivo. Sin `itemId` agrega una línea (con `productoInicial`, p. ej.
 * desde un banner, llega con el producto elegido); con él edita esa línea.
 */
export function useEditorItem({ itemId, productoInicial }: { itemId?: string; productoInicial?: string } = {}) {
  const router = useRouter();
  const { data: tienda, error: errorProductos } = useProductos();
  const borrador = useBorrador({ enabled: Boolean(itemId) });
  const agregarItem = useAgregarItem();
  const editarItem = useEditarItem();

  const [archivo, setArchivo] = useState<PublicArchivo | null>(null);
  const [archivoReverso, setArchivoReverso] = useState<PublicArchivo | null>(null);
  const [reversoElegido, setReversoElegido] = useState<ReversoElegido | null>(null);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGuardar, setErrorGuardar] = useState<string>();
  const [noEsta, setNoEsta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const subida = useSubirArchivo({
    onSubido: (nuevo) => {
      setArchivo(nuevo);
      setErrores((actual) => ({ ...actual, "archivos.frente": undefined }));
    },
  });
  const subidaReverso = useSubirArchivo({
    onSubido: (nuevo) => {
      setArchivoReverso(nuevo);
      setErrores((actual) => ({ ...actual, "archivos.reverso": undefined }));
    },
  });
  const subiendo = subida.subiendo !== null || subidaReverso.subiendo !== null;
  const anios = useMemo(() => aniosCalendario(), []);

  const productos = useMemo(() => tienda?.productos ?? [], [tienda]);

  // Los campos se llenan una sola vez, cuando llegan los productos (y el borrador, al editar).
  const datosBorrador = borrador.data;
  useEffect(() => {
    if (campos || !tienda) return;
    if (!itemId) {
      // Un ?producto= que no existe o no se vende en línea se ignora.
      const inicial = tienda.productos.some((p) => p._id === productoInicial) ? productoInicial! : null;
      return setCampos(camposVacios(inicial));
    }
    if (!datosBorrador) return;
    const linea = datosBorrador.pedido.productos.find((l) => l.lineaId === itemId);
    if (!linea) return setNoEsta(true);
    const { frente, reverso } = linea.archivos;
    setArchivo(datosBorrador.archivos[frente?.archivoId ?? ""] ?? null);
    if (reverso?.tipo === "archivo") {
      setReversoElegido({ tipo: "archivo" });
      setArchivoReverso(datosBorrador.archivos[reverso.archivoId] ?? null);
    } else {
      setReversoElegido(reverso);
    }
    if (!tienda.productos.some((p) => p._id === linea.productoId)) {
      setErrores({ productoId: linea.problema ?? `${linea.nombre} ya no se vende en línea` });
      return setCampos({ ...camposDeLinea(linea), productoId: null });
    }
    setCampos(camposDeLinea(linea));
  }, [campos, tienda, datosBorrador, itemId, productoInicial]);

  const errorCarga = errorProductos ?? borrador.error;
  const errorGeneral =
    errorGuardar ??
    (noEsta ? "Este ítem ya no está en tu pedido" : undefined) ??
    (errorCarga ? (errorCarga instanceof ApiError ? errorCarga.message : "No se pudo cargar el editor") : undefined);

  const producto: Producto | undefined = productos.find((p) => p._id === campos?.productoId);
  const selectores = useMemo(
    () => (producto && campos ? resolverSelectores(producto.variantes, campos.elecciones) : null),
    [producto, campos],
  );
  const variante = selectores?.variante ?? null;
  const especificaciones = useMemo(
    () => (producto && variante ? especificacionesDe(producto, variante.varianteId) : []),
    [producto, variante],
  );
  const reverso = reversoDe(variante, reversoElegido);
  const archivos: ArchivosEditor = { frente: archivo, reverso, archivoReverso };

  // Cotización en vivo: la misma evaluación que usa el servidor. Sin cantidad válida
  // se cotiza la cantidad mínima para mostrar el importe unitario.
  const vivo = useMemo(() => {
    if (!campos || !variante) return null;
    const input = aLineaInput(campos, variante, { frente: null, reverso: null, archivoReverso: null });
    if (input.medida && (Number.isNaN(input.medida.ancho) || Number.isNaN(input.medida.alto))) return null;
    const cantidad = cantidadSchema.safeParse(input.cantidad);
    const evaluacion = evaluarLinea(productos, {
      productoId: input.productoId,
      varianteId: input.varianteId,
      medida: input.medida ?? null,
      especificaciones: input.especificaciones ?? [],
      cantidad: cantidad.success ? cantidad.data : variante.cantidadMinima,
    });
    return { evaluacion, cantidadValida: cantidad.success };
  }, [campos, variante, productos]);

  // Advertencias de cada archivo con las reglas de la variante elegida: cambian al
  // cambiar de variante o de medida, sin volver a subir. Sin medida capturada (variable)
  // solo se revisan formato, peso y color.
  const lineaViva = vivo?.evaluacion.ok ? vivo.evaluacion.linea : null;
  const medidaViva = lineaViva?.medida ?? (variante?.medida.tipo === "fija" ? resolverMedida(variante, null) : null);
  const advertencias = useMemo(() => {
    const vacias = { frente: [] as Advertencia[], reverso: [] as Advertencia[] };
    if (!producto || !variante) return vacias;
    const reglas = reglasDe(producto, variante);
    const esperada = medidaViva ? medidaEsperadaDe(variante, medidaViva) : null;
    const de = (a: PublicArchivo | null) => (a ? validarArchivo(reglas, esperada, a).advertencias : []);
    return { frente: de(archivo), reverso: reverso?.tipo === "archivo" ? de(archivoReverso) : [] };
  }, [producto, variante, medidaViva, archivo, archivoReverso, reverso?.tipo]);

  // Los errores de medida se muestran en cuanto se detectan, sin esperar a guardar.
  const errorVivo =
    vivo && !vivo.evaluacion.ok && vivo.evaluacion.campo.startsWith("medida.")
      ? { [vivo.evaluacion.campo]: vivo.evaluacion.mensaje }
      : {};
  const erroresVisibles: Errores = { ...errores, ...errorVivo };

  function actualizar(cambio: Partial<Campos>, limpiar: CampoEditor[]) {
    setCampos((actual) => (actual ? { ...actual, ...cambio } : actual));
    setErrores((actual) => {
      const siguiente = { ...actual };
      for (const campo of limpiar) delete siguiente[campo];
      return siguiente;
    });
  }

  function elegirProducto(productoId: string) {
    if (!campos || productoId === campos.productoId) return;
    setCampos({ ...camposVacios(productoId), cantidad: campos.cantidad, descripcion: campos.descripcion });
    setErrores(({ "archivos.frente": frente }) => (frente ? { "archivos.frente": frente } : {}));
  }

  function elegirReverso(valor: ReversoElegido) {
    setReversoElegido(valor);
    setErrores((actual) => ({ ...actual, "archivos.reverso": undefined }));
  }

  function elegir(llave: string, valor: string) {
    if (!producto || !campos) return;
    const elecciones = elegirAtributo(producto.variantes, campos.elecciones, llave, valor);
    // Los acabados que no aplican a la nueva variante se quitan.
    const nueva = resolverSelectores(producto.variantes, elecciones).variante;
    const aplican = nueva ? especificacionesDe(producto, nueva.varianteId).map((e) => e.id) : [];
    actualizar(
      { elecciones, especificaciones: campos.especificaciones.filter((id) => aplican.includes(id)) },
      ["varianteId", "especificaciones", "medida.ancho", "medida.alto"],
    );
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!campos || subiendo) return;
    setErrorGuardar(undefined);

    const input = aLineaInput(campos, variante, archivos);
    const nuevos: Errores = {};
    if (!producto) nuevos.productoId ??= "Elige un producto";
    else if (!variante) nuevos.varianteId = "Elige todas las opciones del producto";
    else {
      if (!archivo && reglasDe(producto, variante).requiereArchivo) {
        nuevos["archivos.frente"] = "Sube el archivo que quieres imprimir";
      }
      if (reverso?.tipo === "archivo" && !archivoReverso) nuevos["archivos.reverso"] = "Sube el archivo del reverso";
    }

    const validacion = lineaSchema.safeParse(input);
    if (!validacion.success) {
      for (const issue of validacion.error.issues) {
        const campo = campoDe(issue.path.join("."));
        if (campo && !["productoId", "varianteId"].includes(campo)) nuevos[campo] ??= issue.message;
      }
    } else if (variante) {
      // La misma evaluación que el servidor, con los archivos que ya subió (frente y reverso).
      const disponibles = Object.fromEntries([archivo, archivoReverso].filter((a) => a !== null).map((a) => [a!.id, a!]));
      const evaluacion = evaluarLinea(productos, validacion.data, disponibles);
      if (!evaluacion.ok && esCampo(evaluacion.campo)) nuevos[evaluacion.campo] ??= evaluacion.mensaje;
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardando(true);
    try {
      if (itemId) await editarItem.mutateAsync({ lineaId: itemId, input });
      else await agregarItem.mutateAsync(input);
      router.push("/panel/pedidos/nuevo");
    } catch (e) {
      setGuardando(false);
      if (!(e instanceof ApiError)) return setErrorGuardar("Ocurrió un error inesperado");
      const delServidor: Errores = {};
      for (const [ruta, mensaje] of Object.entries(e.fields)) {
        const campo = campoDe(ruta);
        if (campo) delServidor[campo] ??= mensaje;
      }
      setErrores(delServidor);
      // Un campo sin lugar en el editor se muestra como error general.
      if (Object.keys(delServidor).length === 0) setErrorGuardar(Object.values(e.fields)[0] ?? e.message);
    }
  }

  return {
    tienda,
    productos,
    campos,
    producto,
    selectores: selectores?.selectores ?? [],
    variante,
    especificaciones,
    archivo,
    archivoReverso,
    reverso,
    elegirReverso,
    anios,
    advertencias,
    errores: erroresVisibles,
    errorGeneral,
    guardando,
    subida,
    subidaReverso,
    subiendo,
    vivo,
    actualizar,
    elegirProducto,
    elegir,
    guardar,
  };
}
