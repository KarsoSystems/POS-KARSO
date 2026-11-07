import { randomUUID } from "node:crypto";
import { formatIdCliente, type User } from "@/server/domain/user";
import { createJsonStore, resolveDataDir } from "@/server/storage/json-store";
import {
  CorreoDuplicadoError,
  UsuarioNoEncontradoError,
  type UserPatch,
  type UserRepository,
} from "./types";

// Versión 2 (SPEC 06): datos fiscales y usos de promociones. Versión 3 (SPEC 10):
// tipo de cliente, dirección y nombre del negocio (KARSO 6.1). Los usuarios no son
// datos de prueba desechables (habría que registrarse de nuevo): las versiones
// anteriores se migran.
interface UsersFile {
  version: 3;
  users: User[];
}

type UserV2 = Omit<User, "tipo" | "direccion" | "nombreNegocio">;
type UserV1 = Omit<UserV2, "datosFiscales" | "usosPromociones">;

export function migrarUsers(data: { version: number } & Record<string, unknown>): UsersFile {
  if (data.version !== 1 && data.version !== 2) throw new Error(`users.json: versión ${data.version} no soportada`);
  const v2: UserV2[] =
    data.version === 1
      ? (data.users as UserV1[]).map((user) => ({ ...user, datosFiscales: null, usosPromociones: [] }))
      : (data.users as UserV2[]);
  return {
    version: 3,
    users: v2.map((user) => ({ ...user, tipo: "ocasional", direccion: null, nombreNegocio: null })),
  };
}

interface CountersFile {
  version: 1;
  idCliente: number;
}

export function createJsonUserRepository(dataDir: string = resolveDataDir()): UserRepository {
  const users = createJsonStore<UsersFile>("users.json", { version: 3, users: [] }, dataDir, {
    versionDistinta: { migrar: migrarUsers },
  });
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
          tipo: "ocasional",
          direccion: null,
          nombreNegocio: null,
          datosFiscales: null,
          usosPromociones: [],
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

    async contarUsosPromocion(promocionId, userId) {
      const data = await users.read();
      let totales = 0;
      let delCliente = 0;
      for (const user of data.users) {
        const usos = user.usosPromociones.filter((u) => u.promocionId === promocionId).length;
        totales += usos;
        if (user.id === userId) delCliente = usos;
      }
      return { totales, delCliente };
    },

    registrarUsosPromociones(userId, usos) {
      return users.update((data) => {
        const user = data.users.find((u) => u.id === userId);
        if (!user) throw new UsuarioNoEncontradoError(userId);
        user.usosPromociones.push(...usos);
      });
    },

    liberarUsosPromociones(userId, pedidoId) {
      return users.update((data) => {
        const user = data.users.find((u) => u.id === userId);
        if (!user) throw new UsuarioNoEncontradoError(userId);
        user.usosPromociones = user.usosPromociones.filter((u) => u.pedidoId !== pedidoId);
      });
    },
  };
}
