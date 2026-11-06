import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Almacén de un archivo JSON para el demo. Pensado para un solo proceso:
// - escritura atómica (archivo temporal + rename) para no dejar JSON a medias;
// - mutex en proceso por archivo para que dos read-modify-write no se pisen.

export interface VersionedFile {
  version: number;
}

export interface JsonStore<T extends VersionedFile> {
  /** Devuelve el contenido actual. Crea el archivo con el valor inicial si no existe. */
  read(): Promise<T>;
  /**
   * Lee, aplica `mutate` sobre los datos y escribe el resultado, todo bajo el lock.
   * Si `mutate` lanza, no se escribe nada.
   */
  update<R>(mutate: (data: T) => R | Promise<R>): Promise<R>;
}

/** Carpeta de datos: `DATA_DIR` si está definida; si no, `./data`. */
export function resolveDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

// En desarrollo Next recarga módulos; guardar los locks en globalThis
// evita que dos copias del módulo tengan mutex distintos para el mismo archivo.
const globalLocks = globalThis as typeof globalThis & {
  __jsonStoreLocks?: Map<string, Promise<unknown>>;
};
const locks = (globalLocks.__jsonStoreLocks ??= new Map());

async function withLock<R>(key: string, task: () => Promise<R>): Promise<R> {
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(key, current);
  try {
    return await current;
  } finally {
    if (locks.get(key) === current) locks.delete(key);
  }
}

export interface JsonStoreOptions<T> {
  /**
   * Si el archivo trae otra versión: `"error"` (por defecto) lanza; `"descartar"`
   * lo reemplaza por el valor inicial y deja un aviso en el log (datos de demo);
   * `{ migrar }` lo convierte a la versión actual y lo guarda (datos que no se
   * pueden perder, como los usuarios). `migrar` lanza si no sabe migrar esa versión.
   */
  versionDistinta?: "error" | "descartar" | { migrar: (data: VersionedFile & Record<string, unknown>) => T };
}

export function createJsonStore<T extends VersionedFile>(
  fileName: string,
  initial: T,
  dataDir: string = resolveDataDir(),
  { versionDistinta = "error" }: JsonStoreOptions<T> = {},
): JsonStore<T> {
  const filePath = path.resolve(dataDir, fileName);

  async function writeAtomic(data: T): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
      await rename(tmpPath, filePath);
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }
  }

  async function fresh(): Promise<T> {
    const data = structuredClone(initial);
    await writeAtomic(data);
    return data;
  }

  async function load(): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return fresh();
    }
    const data = JSON.parse(raw) as T;
    if (data.version !== initial.version) {
      if (typeof versionDistinta === "object") {
        const migrado = versionDistinta.migrar(data as T & Record<string, unknown>);
        if (migrado.version !== initial.version) throw new Error(`${fileName}: la migración no llegó a la versión ${initial.version}`);
        console.warn(`[json-store] ${fileName}: versión ${data.version} migrada a la versión ${initial.version}`);
        await writeAtomic(migrado);
        return migrado;
      }
      if (versionDistinta === "descartar") {
        console.warn(`[json-store] ${fileName}: versión ${data.version} descartada; se reinicia en la versión ${initial.version}`);
        return fresh();
      }
      throw new Error(
        `${fileName}: versión ${data.version} no soportada (se esperaba ${initial.version})`,
      );
    }
    return data;
  }

  return {
    read: () => withLock(filePath, load),
    update: (mutate) =>
      withLock(filePath, async () => {
        const data = await load();
        const result = await mutate(data);
        await writeAtomic(data);
        return result;
      }),
  };
}
