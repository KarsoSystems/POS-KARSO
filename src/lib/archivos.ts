import { apiBaseUrl } from "@/lib/api-client";

/** URL para ver o descargar un archivo propio (src de <img> o enlace). */
export const urlArchivo = (id: string) => `${apiBaseUrl()}/api/archivos/${encodeURIComponent(id)}`;

/** Subida de archivo en curso. */
export interface SubidaEnCurso {
  nombre: string;
  /** Avance de 0 a 1. */
  progreso: number;
}
