import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJsonArchivoRepository } from "@/server/repositories/json-archivo-repository";
import { createLocalFileStorage, resolveUploadsDir } from "./local-file-storage";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uploads-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Stream que entrega los trozos dados, uno por lectura. */
const streamDe = (...trozos: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const trozo of trozos) controller.enqueue(new TextEncoder().encode(trozo));
      controller.close();
    },
  });

/** Stream que entrega un trozo y luego falla, como una subida cortada. */
const streamQueFalla = () =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("parcial"));
      controller.error(new Error("conexión cortada"));
    },
  });

const leerTodo = async (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

describe("resolveUploadsDir", () => {
  it("usa UPLOADS_DIR o ./uploads", () => {
    const anterior = process.env.UPLOADS_DIR;
    try {
      process.env.UPLOADS_DIR = "/tmp/otra";
      expect(resolveUploadsDir()).toBe("/tmp/otra");
      delete process.env.UPLOADS_DIR;
      expect(resolveUploadsDir()).toBe(path.join(process.cwd(), "uploads"));
    } finally {
      if (anterior === undefined) delete process.env.UPLOADS_DIR;
      else process.env.UPLOADS_DIR = anterior;
    }
  });
});

describe("LocalFileStorage", () => {
  it("put escribe en streaming y get devuelve el contenido", async () => {
    const storage = createLocalFileStorage(dir);
    await storage.put("abc.png", streamDe("hola ", "mundo"));

    expect(await readFile(path.join(dir, "abc.png"), "utf8")).toBe("hola mundo");
    expect(await leerTodo((await storage.get("abc.png"))!)).toBe("hola mundo");
  });

  it("crea la carpeta si no existe", async () => {
    const storage = createLocalFileStorage(path.join(dir, "nueva", "sub"));
    await storage.put("a.pdf", streamDe("x"));
    expect(await readdir(path.join(dir, "nueva", "sub"))).toEqual(["a.pdf"]);
  });

  it("no deja temporales después de escribir", async () => {
    const storage = createLocalFileStorage(dir);
    await storage.put("a.jpg", streamDe("x"));
    expect(await readdir(dir)).toEqual(["a.jpg"]);
  });

  it("si el stream falla, no queda ni el archivo final ni el temporal", async () => {
    const storage = createLocalFileStorage(dir);
    await expect(storage.put("a.jpg", streamQueFalla())).rejects.toThrow("conexión cortada");
    expect(await readdir(dir)).toEqual([]);
  });

  it("get devuelve null si no existe", async () => {
    expect(await createLocalFileStorage(dir).get("no-existe.png")).toBeNull();
  });

  it("delete borra el archivo y no falla si ya no existe", async () => {
    const storage = createLocalFileStorage(dir);
    await writeFile(path.join(dir, "a.png"), "x");
    await storage.delete("a.png");
    await storage.delete("a.png");
    expect(await readdir(dir)).toEqual([]);
  });

  it("rechaza llaves que salen de la carpeta", async () => {
    const storage = createLocalFileStorage(dir);
    await expect(storage.put("../fuera.png", streamDe("x"))).rejects.toThrow(/Llave de archivo inválida/);
    await expect(storage.get("sub/a.png")).rejects.toThrow(/Llave de archivo inválida/);
    await expect(storage.delete("..")).rejects.toThrow(/Llave de archivo inválida/);
  });
});

describe("JsonArchivoRepository", () => {
  const datos = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "usuario-1",
    nombreOriginal: "cartel-perro.jpg",
    extension: "jpg" as const,
    mime: "image/jpeg",
    bytes: 1234,
    previsualizable: true,
  };

  it("create asigna createdAt y lo guarda en archivos.json", async () => {
    const repo = createJsonArchivoRepository(dir);
    const archivo = await repo.create(datos);

    expect(archivo).toMatchObject(datos);
    expect(Number.isNaN(Date.parse(archivo.createdAt))).toBe(false);
    const json = JSON.parse(await readFile(path.join(dir, "archivos.json"), "utf8"));
    expect(json).toEqual({ version: 1, archivos: [archivo] });
  });

  it("findById devuelve el archivo o null", async () => {
    const repo = createJsonArchivoRepository(dir);
    await repo.create(datos);
    expect((await repo.findById(datos.id))?.nombreOriginal).toBe("cartel-perro.jpg");
    expect(await repo.findById("otro")).toBeNull();
  });

  it("delete quita el registro", async () => {
    const repo = createJsonArchivoRepository(dir);
    await repo.create(datos);
    await repo.delete(datos.id);
    expect(await repo.findById(datos.id)).toBeNull();
  });
});
