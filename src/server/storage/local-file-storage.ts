import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { assertKeyValida, type FileStorage } from "./file-storage";

/** Carpeta de archivos subidos: `UPLOADS_DIR` si está definida; si no, `./uploads`. */
export function resolveUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
}

/**
 * Disco local. La escritura va en streaming a un archivo temporal en la misma
 * carpeta y luego se renombra: nunca se carga el archivo completo en memoria y
 * una subida cortada no deja un archivo a medias con el nombre final.
 */
export function createLocalFileStorage(dir: string = resolveUploadsDir()): FileStorage {
  const root = path.resolve(dir);
  const ruta = (key: string) => {
    assertKeyValida(key);
    return path.join(root, key);
  };

  return {
    async put(key, data) {
      const destino = ruta(key);
      const carpeta = path.dirname(destino);
      await mkdir(carpeta, { recursive: true });
      const tmp = path.join(carpeta, `.${path.basename(destino)}.${randomUUID()}.tmp`);
      try {
        await pipeline(
          Readable.fromWeb(data as NodeReadableStream<Uint8Array>),
          createWriteStream(tmp, { flags: "wx" }),
        );
        await rename(tmp, destino);
      } catch (error) {
        await rm(tmp, { force: true });
        throw error;
      }
    },

    async get(key) {
      const origen = ruta(key);
      try {
        if (!(await stat(origen)).isFile()) return null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      return Readable.toWeb(createReadStream(origen)) as ReadableStream<Uint8Array>;
    },

    async copy(origen, destino) {
      const desde = ruta(origen);
      const hacia = ruta(destino);
      const carpeta = path.dirname(hacia);
      await mkdir(carpeta, { recursive: true });
      const tmp = path.join(carpeta, `.${path.basename(hacia)}.${randomUUID()}.tmp`);
      try {
        await copyFile(desde, tmp);
        await rename(tmp, hacia);
      } catch (error) {
        await rm(tmp, { force: true });
        throw error;
      }
    },

    async delete(key) {
      await rm(ruta(key), { force: true });
    },
  };
}
