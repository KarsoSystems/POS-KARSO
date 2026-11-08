import type { MotivoRevocacion, Sesion } from "@/server/domain/sesion";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import type { SesionRepository } from "./types";

// Versión 1 (SPEC 11). Al escribir se quitan las sesiones vencidas o revocadas hace
// más de 7 días: ya no sirven ni para detectar el reúso de un token.
interface SesionesFile {
  version: 1;
  sesiones: Sesion[];
}

const CONSERVAR_MS = 7 * 24 * 60 * 60 * 1000;

export function createJsonSesionRepository(dataDir: string = resolveDataDir()): SesionRepository {
  const store = createJsonStore<SesionesFile>("sesiones.json", { version: 1, sesiones: [] }, dataDir, {
    versionDistinta: "descartar",
  });

  /** Quita lo que ya no sirve (en cada escritura). */
  function limpiar(data: SesionesFile, ahora: Date): void {
    const limite = ahora.getTime() - CONSERVAR_MS;
    data.sesiones = data.sesiones.filter((s) => {
      const fin = s.revocadaEn ? Date.parse(s.revocadaEn) : Date.parse(s.expiraEn);
      return fin > limite;
    });
  }

  return {
    create(sesion) {
      return store.update((data) => {
        limpiar(data, new Date(sesion.creadaEn));
        data.sesiones.push(sesion);
        return sesion;
      });
    },

    async findById(id) {
      const data = await store.read();
      return data.sesiones.find((s) => s.id === id) ?? null;
    },

    update(id, cambiar) {
      return store.update(async (data) => {
        const sesion = data.sesiones.find((s) => s.id === id);
        if (!sesion) return null;
        await cambiar(sesion);
        return { ...sesion };
      });
    },

    revocarDelUsuario(userId, { excepto, motivo, ahora = new Date() }: { excepto?: string; motivo: MotivoRevocacion; ahora?: Date }) {
      return store.update((data) => {
        let revocadas = 0;
        for (const sesion of data.sesiones) {
          if (sesion.userId !== userId || sesion.id === excepto || sesion.revocadaEn) continue;
          if (Date.parse(sesion.expiraEn) <= ahora.getTime()) continue;
          sesion.revocadaEn = ahora.toISOString();
          sesion.motivoRevocacion = motivo;
          revocadas++;
        }
        limpiar(data, ahora);
        return revocadas;
      });
    },
  };
}
