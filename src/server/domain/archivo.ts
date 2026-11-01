import type { ExtensionPermitida } from "@/lib/validation/pedidos";

export type { ExtensionPermitida };

export interface Archivo {
  id: string; // UUID; nombre en disco: uploads/<id>.<ext>
  userId: string; // dueño; solo él puede leerlo
  nombreOriginal: string; // "cartel-perro.jpg"
  extension: ExtensionPermitida;
  mime: string; // fijo por extensión (MIME_POR_EXTENSION)
  bytes: number; // ≤ 50 MB (52_428_800)
  previsualizable: boolean; // true solo para jpg/jpeg/png
  createdAt: string; // ISO 8601
}

/** Llave del binario en el almacenamiento: "<id>.<ext>". */
export function archivoKey(archivo: Pick<Archivo, "id" | "extension">): string {
  return `${archivo.id}.${archivo.extension}`;
}

/** Archivo expuesto al front (sin userId). */
export type PublicArchivo = Omit<Archivo, "userId">;

export function toPublicArchivo(archivo: Archivo): PublicArchivo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, ...publicArchivo } = archivo;
  return publicArchivo;
}
