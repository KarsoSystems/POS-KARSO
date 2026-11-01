import type { FileStorage } from "./file-storage";
import { createLocalFileStorage } from "./local-file-storage";

// Punto único donde se elige el almacenamiento de archivos. Para S3, solo cambia esto.
export const fileStorage: FileStorage = createLocalFileStorage();

export type { FileStorage };
