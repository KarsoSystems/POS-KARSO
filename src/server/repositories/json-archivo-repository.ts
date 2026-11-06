import type { Archivo } from "@/server/domain/archivo";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import { ArchivoNoEncontradoError, type ArchivoRepository } from "./types";

// Versión 2 (SPEC 05): llave, estado, metadatos y miniatura. Los datos de la
// versión 1 son de demo y se descartan, como orders.json en la SPEC 04.
interface ArchivosFile {
  version: 2;
  archivos: Archivo[];
}

export function createJsonArchivoRepository(dataDir: string = resolveDataDir()): ArchivoRepository {
  const store = createJsonStore<ArchivosFile>("archivos.json", { version: 2, archivos: [] }, dataDir, {
    versionDistinta: "descartar",
  });

  return {
    async create(input) {
      return store.update((data) => {
        const archivo: Archivo = { ...input, createdAt: new Date().toISOString() };
        data.archivos.push(archivo);
        return archivo;
      });
    },

    async findById(id) {
      const data = await store.read();
      return data.archivos.find((a) => a.id === id) ?? null;
    },

    async update(id, patch) {
      return store.update((data) => {
        const i = data.archivos.findIndex((a) => a.id === id);
        if (i < 0) throw new ArchivoNoEncontradoError(id);
        data.archivos[i] = { ...data.archivos[i], ...patch };
        return data.archivos[i];
      });
    },

    async delete(id) {
      await store.update((data) => {
        data.archivos = data.archivos.filter((a) => a.id !== id);
      });
    },
  };
}
