import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    await expect(storage.get("sub/../a.png")).rejects.toThrow(/Llave de archivo inválida/);
    await expect(storage.get("/etc/passwd")).rejects.toThrow(/Llave de archivo inválida/);
    await expect(storage.put("sub//a.png", streamDe("x"))).rejects.toThrow(/Llave de archivo inválida/);
    await expect(storage.delete("..")).rejects.toThrow(/Llave de archivo inválida/);
  });

  it("copy copia a otra llave (creando carpetas) y falla si el origen no existe", async () => {
    const storage = createLocalFileStorage(dir);
    await storage.put("temporal/a.jpg", streamDe("hola"));
    await storage.copy("temporal/a.jpg", "pedidos/P-000001/l_frente.jpg");
    expect(await leerTodo((await storage.get("pedidos/P-000001/l_frente.jpg"))!)).toBe("hola");
    expect(await leerTodo((await storage.get("temporal/a.jpg"))!)).toBe("hola");
    await expect(storage.copy("temporal/no.jpg", "pedidos/x.jpg")).rejects.toThrow();
    expect(await readdir(path.join(dir, "pedidos"))).toEqual(["P-000001"]);
  });

  it("acepta llaves con carpetas y las crea", async () => {
    const storage = createLocalFileStorage(dir);
    await storage.put("pedidos/P-000001/linea_frente.jpg", streamDe("x"));
    expect(await readdir(path.join(dir, "pedidos", "P-000001"))).toEqual(["linea_frente.jpg"]);
    expect(await leerTodo((await storage.get("pedidos/P-000001/linea_frente.jpg"))!)).toBe("x");
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
    key: "temporal/11111111-1111-4111-8111-111111111111.jpg",
    estado: "pendiente" as const,
    metadatos: null,
    miniatura: false,
    subidoEn: null,
  };

  it("create asigna createdAt y lo guarda en archivos.json", async () => {
    const repo = createJsonArchivoRepository(dir);
    const archivo = await repo.create(datos);

    expect(archivo).toMatchObject(datos);
    expect(Number.isNaN(Date.parse(archivo.createdAt))).toBe(false);
    const json = JSON.parse(await readFile(path.join(dir, "archivos.json"), "utf8"));
    expect(json).toEqual({ version: 2, archivos: [archivo] });
  });

  it("findById devuelve el archivo o null", async () => {
    const repo = createJsonArchivoRepository(dir);
    await repo.create(datos);
    expect((await repo.findById(datos.id))?.nombreOriginal).toBe("cartel-perro.jpg");
    expect(await repo.findById("otro")).toBeNull();
  });

  it("update cambia los campos y lanza si no existe", async () => {
    const repo = createJsonArchivoRepository(dir);
    await repo.create(datos);
    const actualizado = await repo.update(datos.id, { estado: "subido", miniatura: true });
    expect(actualizado).toMatchObject({ estado: "subido", miniatura: true, nombreOriginal: "cartel-perro.jpg" });
    expect((await repo.findById(datos.id))?.estado).toBe("subido");
    await expect(repo.update("otro", { estado: "subido" })).rejects.toThrow("Archivo otro no encontrado");
  });

  it("descarta archivos.json de la versión 1", async () => {
    await writeFile(path.join(dir, "archivos.json"), JSON.stringify({ version: 1, archivos: [{ id: "viejo" }] }));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createJsonArchivoRepository(dir);
    expect(await repo.findById("viejo")).toBeNull();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("delete quita el registro", async () => {
    const repo = createJsonArchivoRepository(dir);
    await repo.create(datos);
    await repo.delete(datos.id);
    expect(await repo.findById(datos.id)).toBeNull();
  });
});
