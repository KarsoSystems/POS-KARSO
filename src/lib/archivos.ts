import { apiBaseUrl } from "@/lib/api-client";

/** URL para ver o descargar un archivo propio (src de <img> o enlace). */
export const urlArchivo = (id: string) => `${apiBaseUrl()}/api/archivos/${encodeURIComponent(id)}`;

/** Miniatura JPG en sRGB que genera el servidor para JPG y TIFF. */
export const urlMiniatura = (id: string) => `${urlArchivo(id)}/miniatura`;

/** Subida de archivo en curso. */
export interface SubidaEnCurso {
  nombre: string;
  /** Avance de 0 a 1. */
  progreso: number;
}

/**
 * Lo que el cliente eligió para el reverso en el editor. `archivo` es "voy a subir
 * mi archivo" (el archivo en sí va aparte); `null` = aún no elige (reverso obligatorio).
 */
export type ReversoElegido =
  | { tipo: "ninguno" }
  | { tipo: "archivo" }
  | { tipo: "calendario"; anio: number }
  | { tipo: "texto"; texto: string };
