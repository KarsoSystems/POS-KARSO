import type { WhatsappVerification } from "@/server/domain/verification";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import type { VerificationRepository } from "./types";

// Versión 2 (SPEC 10): cada código guarda el número al que se envió. Un archivo
// anterior se descarta: los códigos duran 10 minutos.
interface VerificationsFile {
  version: 2;
  items: WhatsappVerification[];
}

export function createJsonVerificationRepository(
  dataDir: string = resolveDataDir(),
): VerificationRepository {
  const store = createJsonStore<VerificationsFile>(
    "verifications.json",
    { version: 2, items: [] },
    dataDir,
    { versionDistinta: "descartar" },
  );

  return {
    async upsert(v) {
      await store.update((data) => {
        data.items = data.items.filter((item) => item.userId !== v.userId);
        data.items.push(v);
      });
    },

    async findByUserId(userId) {
      const data = await store.read();
      return data.items.find((item) => item.userId === userId) ?? null;
    },

    async delete(userId) {
      await store.update((data) => {
        data.items = data.items.filter((item) => item.userId !== userId);
      });
    },
  };
}
