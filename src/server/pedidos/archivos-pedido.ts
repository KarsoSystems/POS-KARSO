import { randomUUID } from "node:crypto";
import type { ArchivoLinea } from "@/lib/pedidos/archivo-linea";
import { llaveMiniatura, type Archivo } from "@/server/domain/archivo";
import type { Pedido } from "@/server/domain/pedido";
import { archivoRepository } from "@/server/repositories";
import { fileStorage } from "@/server/storage";

// Al hacer el pedido (SPEC 05), cada cara con archivo de cada línea se copia de
// temporal/ a la carpeta del folio, como un Archivo nuevo, y la línea apunta a él.
// Así el pedido conserva sus archivos aunque el cliente borre o cambie los del
// borrador. En R2 será un CopyObject; la regla de 48 h limpia temporal/.

/** "pedidos/P-000001/<lineaId>_frente.jpg". */
export function llavePedido(folio: string, lineaId: string, cara: "frente" | "reverso", extension: string): string {
  return `pedidos/${folio}/${lineaId}_${cara}.${extension}`;
}

/**
 * Copia los archivos del pedido a `pedidos/<folio>/` y cambia los `archivoId` de
 * las líneas por los de las copias. Un mismo archivo en dos líneas queda copiado
 * dos veces. Devuelve los ids originales, para liberarlos después de confirmar.
 * Si una copia falla, borra las que ya hizo y lanza: el pedido no se confirma.
 */
export async function copiarArchivosAlPedido(pedido: Pedido, folio: string): Promise<string[]> {
  const originales = new Set<string>();
  const copias: Archivo[] = [];

  async function copiar(cara: ArchivoLinea, lineaId: string, nombreCara: "frente" | "reverso"): Promise<void> {
    const origen = await archivoRepository.findById(cara.archivoId);
    if (!origen || origen.userId !== pedido.userId) throw new Error(`Archivo ${cara.archivoId} no disponible`);

    const key = llavePedido(folio, lineaId, nombreCara, origen.extension);
    await fileStorage.copy(origen.key, key);
    if (origen.miniatura) await fileStorage.copy(llaveMiniatura(origen.key), llaveMiniatura(key));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { createdAt, ...datos } = origen;
    const copia = await archivoRepository.create({ ...datos, id: randomUUID(), key });
    copias.push(copia);
    originales.add(origen.id);
    cara.archivoId = copia.id;
  }

  try {
    for (const linea of pedido.productos) {
      const { frente, reverso } = linea.archivos;
      if (frente) await copiar(frente, linea.lineaId, "frente");
      if (reverso?.tipo === "archivo") await copiar(reverso, linea.lineaId, "reverso");
    }
  } catch (error) {
    for (const copia of copias) await borrarArchivo(copia);
    throw error;
  }
  return [...originales];
}

/** Borra registro, binario y miniatura. */
export async function borrarArchivo(archivo: Archivo): Promise<void> {
  await archivoRepository.delete(archivo.id);
  await fileStorage.delete(archivo.key);
  if (archivo.miniatura) await fileStorage.delete(llaveMiniatura(archivo.key));
}
