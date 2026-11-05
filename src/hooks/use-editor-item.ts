"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { evaluarItem, medidasDelTamano } from "@/lib/pedidos/item";
import { cantidadSchema, itemSchema, tamanoSchema, type ItemInput } from "@/lib/validation/pedidos";
import type { Catalogo, PublicArchivo, Subpedido } from "@/lib/pedidos-api";
import { useCatalogo } from "./use-catalogo";
import { useAgregarItem, useBorrador, useEditarItem } from "./use-pedidos";
import { useSubirArchivo } from "./use-subir-archivo";

export const PERSONALIZADO = "__personalizado";

export interface Campos {
  productoId: string;
  tamanoId: string; // id de un predefinido o PERSONALIZADO
  anchoCm: string;
  altoCm: string;
  papelId: string;
  hojaId: string;
  cantidad: string;
  descripcion: string;
}

export type Errores = Partial<Record<keyof Campos | "archivoId", string>>;

export type Vivo = {
  pieza: ReturnType<typeof medidasDelTamano>;
  evaluacion: ReturnType<typeof evaluarItem>;
  cantidadValida: boolean;
} | null;

/** "1,000" o "1 000" → 1000; "9,5" → 9.5. Vacío o inválido → NaN. */
const aNumero = (valor: string, decimal = false) => {
  const limpio = decimal ? valor.trim().replace(",", ".") : valor.replace(/[\s,]/g, "");
  return limpio === "" ? Number.NaN : Number(limpio);
};

function camposIniciales(catalogo: Catalogo): Campos {
  const producto = catalogo.productos[0];
  return {
    productoId: producto.id,
    tamanoId: producto.tamanos[0]?.id ?? PERSONALIZADO,
    anchoCm: "",
    altoCm: "",
    papelId: producto.papelesIds[0],
    hojaId: catalogo.hojas[0].id,
    cantidad: "",
    descripcion: "",
  };
}

function camposDelItem(item: Subpedido): Campos {
  return {
    productoId: item.productoId,
    tamanoId: item.tamano.tipo === "predefinido" ? item.tamano.tamanoId : PERSONALIZADO,
    anchoCm: item.tamano.tipo === "personalizado" ? String(item.tamano.anchoCm) : "",
    altoCm: item.tamano.tipo === "personalizado" ? String(item.tamano.altoCm) : "",
    papelId: item.papelId,
    hojaId: item.hojaId,
    cantidad: String(item.cantidad),
    descripcion: item.descripcion,
  };
}

/** Lleva los campos del formulario a la forma de la API. */
function aItemInput(campos: Campos, archivoId: string): ItemInput {
  return {
    archivoId,
    descripcion: campos.descripcion,
    productoId: campos.productoId,
    tamano:
      campos.tamanoId === PERSONALIZADO
        ? { tipo: "personalizado", anchoCm: aNumero(campos.anchoCm, true), altoCm: aNumero(campos.altoCm, true) }
        : { tipo: "predefinido", tamanoId: campos.tamanoId },
    papelId: campos.papelId,
    hojaId: campos.hojaId,
    cantidad: aNumero(campos.cantidad),
  };
}

/** "tamano.anchoCm" → "anchoCm"; "tamano" → "tamanoId". */
function campoDeRuta(ruta: string): keyof Errores | null {
  if (ruta === "tamano.anchoCm") return "anchoCm";
  if (ruta === "tamano.altoCm") return "altoCm";
  if (ruta.startsWith("tamano")) return "tamanoId";
  const campos = ["archivoId", "productoId", "papelId", "hojaId", "cantidad", "descripcion"];
  return campos.includes(ruta) ? (ruta as keyof Errores) : null;
}

/**
 * Estado del editor de un ítem: campos, errores, archivo, presupuesto y vista
 * previa en vivo. Sin `itemId` agrega un ítem nuevo; con él edita ese ítem.
 */
export function useEditorItem(itemId?: string) {
  const router = useRouter();
  const { data: catalogo, error: errorCatalogo } = useCatalogo();
  const borrador = useBorrador({ enabled: Boolean(itemId) });
  const agregarItem = useAgregarItem();
  const editarItem = useEditarItem();

  const [archivo, setArchivo] = useState<PublicArchivo | null>(null);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGuardar, setErrorGuardar] = useState<string>();
  const [noEsta, setNoEsta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const subida = useSubirArchivo({
    onSubido: (nuevo) => {
      setArchivo(nuevo);
      setErrores((actual) => ({ ...actual, archivoId: undefined }));
    },
  });
  const subiendo = subida.subiendo !== null;

  // Los campos se llenan una sola vez, cuando llegan el catálogo (y el borrador, al editar).
  const datosBorrador = borrador.data;
  useEffect(() => {
    if (campos || !catalogo) return;
    if (!itemId) return setCampos(camposIniciales(catalogo));
    if (!datosBorrador) return;
    const item = datosBorrador.pedido.items.find((i) => i.id === itemId);
    if (!item) return setNoEsta(true);
    setArchivo(datosBorrador.archivos[item.archivoId] ?? null);
    setCampos(camposDelItem(item));
  }, [campos, catalogo, datosBorrador, itemId]);

  const errorCarga = errorCatalogo ?? borrador.error;
  const errorGeneral =
    errorGuardar ??
    (noEsta ? "Este ítem ya no está en tu pedido" : undefined) ??
    (errorCarga ? (errorCarga instanceof ApiError ? errorCarga.message : "No se pudo cargar el editor") : undefined);

  const producto = catalogo?.productos.find((p) => p.id === campos?.productoId);

  // Presupuesto en vivo: la misma función que usa el servidor.
  const vivo: Vivo = useMemo(() => {
    if (!catalogo || !campos || !producto) return null;
    const input = aItemInput(campos, archivo?.id ?? "");
    const tamano = tamanoSchema.safeParse(input.tamano);
    if (!tamano.success) return null;
    const pieza = medidasDelTamano(producto, tamano.data);
    const cantidad = cantidadSchema.safeParse(input.cantidad);
    // Sin cantidad válida se evalúa con 1 para saber si cabe y cuántas piezas por hoja.
    const evaluacion = evaluarItem(catalogo, {
      ...input,
      tamano: tamano.data,
      cantidad: cantidad.success ? cantidad.data : 1,
    });
    return { pieza, evaluacion, cantidadValida: cantidad.success };
  }, [catalogo, campos, producto, archivo]);

  function cambiar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((actual) => (actual ? { ...actual, [campo]: valor } : actual));
    setErrores((actual) => ({ ...actual, [campo]: undefined }));
  }

  function cambiarProducto(productoId: string) {
    const nuevo = catalogo?.productos.find((p) => p.id === productoId);
    if (!nuevo || !campos) return;
    setCampos({
      ...campos,
      productoId,
      tamanoId: nuevo.tamanos[0]?.id ?? PERSONALIZADO,
      papelId: nuevo.papelesIds.includes(campos.papelId) ? campos.papelId : nuevo.papelesIds[0],
    });
    setErrores({});
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!catalogo || !campos || subiendo) return;
    setErrorGuardar(undefined);

    const input = aItemInput(campos, archivo?.id ?? "");
    const nuevos: Errores = {};
    if (!archivo) nuevos.archivoId = "Sube el archivo que quieres imprimir";
    const validacion = itemSchema.safeParse(input);
    if (!validacion.success) {
      for (const issue of validacion.error.issues) {
        const campo = campoDeRuta(issue.path.join("."));
        if (campo && campo !== "archivoId") nuevos[campo] ??= issue.message;
      }
    } else {
      const evaluacion = evaluarItem(catalogo, validacion.data);
      if (!evaluacion.ok) nuevos[evaluacion.campo === "tamano" ? "tamanoId" : evaluacion.campo] = evaluacion.mensaje;
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardando(true);
    try {
      if (itemId) await editarItem.mutateAsync({ itemId, input });
      else await agregarItem.mutateAsync(input);
      router.push("/panel/pedidos/nuevo");
    } catch (e) {
      setGuardando(false);
      if (!(e instanceof ApiError)) return setErrorGuardar("Ocurrió un error inesperado");
      const delServidor: Errores = {};
      for (const [ruta, mensaje] of Object.entries(e.fields)) {
        const campo = campoDeRuta(ruta);
        if (campo) delServidor[campo] = mensaje;
      }
      setErrores(delServidor);
      if (Object.keys(delServidor).length === 0) setErrorGuardar(e.message);
    }
  }

  const hojaElegida = catalogo?.hojas.find((h) => h.id === campos?.hojaId);

  // "No cabe" se muestra junto a la hoja en cuanto se detecta, sin esperar a guardar.
  const noCabe = vivo && !vivo.evaluacion.ok && vivo.evaluacion.noCabe ? vivo.evaluacion.mensaje : undefined;

  return {
    catalogo,
    campos,
    producto,
    archivo,
    errores,
    errorGeneral,
    guardando,
    subida,
    subiendo,
    vivo,
    noCabe,
    hojaElegida,
    cambiar,
    cambiarProducto,
    guardar,
  };
}
