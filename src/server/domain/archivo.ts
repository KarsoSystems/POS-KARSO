import type { ColorArchivo, MetadatosArchivo } from "@/lib/pedidos/archivo-linea";
import type { ExtensionPermitida } from "@/lib/validation/pedidos";

export type { ColorArchivo, ExtensionPermitida, MetadatosArchivo };

// Archivo de un cliente (SPEC 05). Se sube en tres pasos que emulan R2: URL
// firmada (pendiente), PUT del binario y confirmación (subido, con metadatos).

export interface Archivo {
  id: string; // UUID
  userId: string; // dueño; solo él puede leerlo
  nombreOriginal: string; // "cartel-perro.jpg"
  extension: ExtensionPermitida;
  mime: string; // fijo por extensión (MIME_POR_EXTENSION)
  bytes: number; // declarados al pedir la URL; los reales al confirmar
  key: string; // "temporal/<id>.<ext>" o "pedidos/<folio>/<lineaId>_<cara>.<ext>"
  estado: "pendiente" | "subido"; // pendiente = URL emitida, aún sin confirmar
  metadatos: MetadatosArchivo | null; // se llena al confirmar
  miniatura: boolean; // true si existe "<key>.miniatura.jpg"
  createdAt: string; // ISO 8601
  subidoEn: string | null;
}

/** Llave del binario recién pedido: "temporal/<id>.<ext>". */
export function llaveTemporal(archivo: Pick<Archivo, "id" | "extension">): string {
  return `temporal/${archivo.id}.${archivo.extension}`;
}

/** Llave de la miniatura JPG del archivo guardado en `key`. */
export function llaveMiniatura(key: string): string {
  return `${key}.miniatura.jpg`;
}

/** Archivo expuesto al front (sin userId ni la llave interna). */
export type PublicArchivo = Omit<Archivo, "userId" | "key">;

export function toPublicArchivo(archivo: Archivo): PublicArchivo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, key, ...publicArchivo } = archivo;
  return publicArchivo;
}
