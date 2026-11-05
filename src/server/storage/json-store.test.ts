import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJsonStore, resolveDataDir } from "./json-store";

interface CounterFile {
  version: 1;
  count: number;
}

const initial: CounterFile = { version: 1, count: 0 };

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "json-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const readJson = async (file: string) => JSON.parse(await readFile(path.join(dir, file), "utf8"));

describe("createJsonStore", () => {
  it("crea el archivo con el valor inicial si no existe", async () => {
    const store = createJsonStore("counter.json", initial, dir);
    expect(await store.read()).toEqual(initial);
    expect(await readJson("counter.json")).toEqual(initial);
  });

  it("crea la carpeta de datos si no existe", async () => {
    const store = createJsonStore("counter.json", initial, path.join(dir, "anidada"));
    await store.read();
    expect(await readdir(path.join(dir, "anidada"))).toEqual(["counter.json"]);
  });

  it("no comparte referencias con el valor inicial", async () => {
    const store = createJsonStore("counter.json", initial, dir);
    await store.update((data) => {
      data.count = 5;
    });
    expect(initial.count).toBe(0);
  });

  it("persiste los cambios de update y devuelve su resultado", async () => {
    const store = createJsonStore("counter.json", initial, dir);
    const result = await store.update((data) => ++data.count);
    expect(result).toBe(1);
    expect(await readJson("counter.json")).toEqual({ version: 1, count: 1 });
  });

  it("serializa updates concurrentes sin perder escrituras", async () => {
    const store = createJsonStore("counter.json", initial, dir);
    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.update((data) => ++data.count)),
    );
    expect((await store.read()).count).toBe(50);
    expect(new Set(results).size).toBe(50);
  });

  it("dos stores del mismo archivo comparten el lock", async () => {
    const a = createJsonStore("counter.json", initial, dir);
    const b = createJsonStore("counter.json", initial, dir);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).update((data) => ++data.count)),
    );
    expect((await a.read()).count).toBe(20);
  });

  it("si mutate lanza, no escribe y libera el lock", async () => {
    const store = createJsonStore("counter.json", initial, dir);
    await expect(
      store.update((data) => {
        data.count = 99;
        throw new Error("falla");
      }),
    ).rejects.toThrow("falla");
    expect((await store.read()).count).toBe(0);
    await store.update((data) => ++data.count);
    expect((await store.read()).count).toBe(1);
  });

  it("no deja archivos temporales", async () => {
    const store = createJsonStore("counter.json", initial, dir);
    await Promise.all(Array.from({ length: 10 }, () => store.update((data) => ++data.count)));
    expect(await readdir(dir)).toEqual(["counter.json"]);
  });

  it("falla explícitamente ante una versión desconocida", async () => {
    await writeFile(path.join(dir, "counter.json"), JSON.stringify({ version: 2, count: 0 }));
    const store = createJsonStore("counter.json", initial, dir);
    await expect(store.read()).rejects.toThrow("counter.json: versión 2 no soportada");
  });

  it("con versionDistinta 'descartar' reinicia el archivo y avisa en el log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeFile(path.join(dir, "counter.json"), JSON.stringify({ version: 2, count: 7 }));
    const store = createJsonStore("counter.json", initial, dir, { versionDistinta: "descartar" });
    expect(await store.read()).toEqual(initial);
    expect(await readJson("counter.json")).toEqual(initial);
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/counter\.json: versión 2 descartada/));
    aviso.mockRestore();
  });
});

describe("resolveDataDir", () => {
  const original = process.env.DATA_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
  });

  it("usa DATA_DIR si está definida", () => {
    process.env.DATA_DIR = "/tmp/otro";
    expect(resolveDataDir()).toBe("/tmp/otro");
  });

  it("usa ./data por defecto", () => {
    delete process.env.DATA_DIR;
    expect(resolveDataDir()).toBe(path.join(process.cwd(), "data"));
  });
});
