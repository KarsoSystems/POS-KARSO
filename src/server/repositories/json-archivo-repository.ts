import type { Archivo } from "@/server/domain/archivo";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import type { ArchivoRepository } from "./types";

interface ArchivosFile {
  version: 1;
  archivos: Archivo[];
}

export function createJsonArchivoRepository(dataDir: string = resolveDataDir()): ArchivoRepository {
  const store = createJsonStore<ArchivosFile>("archivos.json", { version: 1, archivos: [] }, dataDir);

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

    async delete(id) {
      await store.update((data) => {
        data.archivos = data.archivos.filter((a) => a.id !== id);
      });
    },
  };
}
