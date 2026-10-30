import { randomUUID } from "node:crypto";
import { formatIdCliente, type User } from "@/server/domain/user";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import {
  CorreoDuplicadoError,
  UsuarioNoEncontradoError,
  type UserPatch,
  type UserRepository,
} from "./types";

interface UsersFile {
  version: 1;
  users: User[];
}

interface CountersFile {
  version: 1;
  idCliente: number;
}

export function createJsonUserRepository(dataDir: string = resolveDataDir()): UserRepository {
  const users = createJsonStore<UsersFile>("users.json", { version: 1, users: [] }, dataDir);
  const counters = createJsonStore<CountersFile>(
    "counters.json",
    { version: 1, idCliente: 0 },
    dataDir,
  );

  const normalize = (correo: string) => correo.trim().toLowerCase();

  return {
    async findById(id) {
      const data = await users.read();
      return data.users.find((u) => u.id === id) ?? null;
    },

    async findByCorreo(correo) {
      const data = await users.read();
      return data.users.find((u) => u.correo === normalize(correo)) ?? null;
    },

    create(input) {
      // Orden de locks fijo: users.json → counters.json. El consecutivo
      // solo se consume si el correo no está duplicado.
      return users.update(async (data) => {
        const correo = normalize(input.correo);
        if (data.users.some((u) => u.correo === correo)) throw new CorreoDuplicadoError(correo);

        const consecutivo = await counters.update((c) => ++c.idCliente);
        const now = new Date().toISOString();
        const user: User = {
          ...input,
          correo,
          id: randomUUID(),
          idCliente: formatIdCliente(consecutivo),
          createdAt: now,
          updatedAt: now,
        };
        data.users.push(user);
        return user;
      });
    },

    update(id, patch) {
      return users.update((data) => {
        const index = data.users.findIndex((u) => u.id === id);
        if (index === -1) throw new UsuarioNoEncontradoError(id);

        // Los campos inmutables se ignoran aunque lleguen en el patch.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, idCliente, createdAt, ...cambios } = patch as UserPatch & Partial<User>;
        if (cambios.correo !== undefined) {
          cambios.correo = normalize(cambios.correo);
          const correo = cambios.correo;
          if (data.users.some((u) => u.correo === correo && u.id !== id)) {
            throw new CorreoDuplicadoError(correo);
          }
        }

        const updated: User = {
          ...data.users[index],
          ...cambios,
          updatedAt: new Date().toISOString(),
        };
        data.users[index] = updated;
        return updated;
      });
    },
  };
}
