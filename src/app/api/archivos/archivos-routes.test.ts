import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// DATA_DIR, UPLOADS_DIR y AUTH_SECRET deben existir antes de importar repositorios y storage.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/archivos-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { base, dataDir: process.env.DATA_DIR, uploadsDir: process.env.UPLOADS_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { GET as descargar } from "./[id]/route";
import { POST as subir } from "./route";
import { TAMANO_MAXIMO_ARCHIVO_BYTES } from "@/lib/validation/pedidos";
import { jar } from "@/test/next-headers-mock";
import { cambiarSesion, iniciarSesionActiva } from "@/test/sesion";

const conArchivo = (nombre: string, contenido: BlobPart = "contenido", campo = "archivo") => {
  const form = new FormData();
  form.append(campo, new File([contenido], nombre));
  return new Request("http://localhost/api/archivos", { method: "POST", body: form });
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const getArchivo = (id: string) => descargar(new Request(`http://localhost/api/archivos/${id}`), params(id));

const enUploads = async () => {
  try {
    return await readdir(env.uploadsDir);
  } catch {
    return [];
  }
};

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  jar.clear();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("POST /api/archivos", () => {
  it("sin sesión responde 401", async () => {
    expect((await subir(conArchivo("a.jpg"))).status).toBe(401);
  });

  it.each(["foto.jpg", "foto.JPEG", "logo.png", "diseño.pdf", "vector.ai", "capas.psd"])(
    "acepta %s: 201, binario en uploads/ y registro en archivos.json",
    async (nombre) => {
      const user = await iniciarSesionActiva();
      const res = await subir(conArchivo(nombre, "hola mundo"));
      expect(res.status).toBe(201);

      const { archivo } = await res.json();
      const extension = nombre.split(".").pop()!.toLowerCase();
      expect(archivo).toMatchObject({ nombreOriginal: nombre, extension, bytes: 10 });
      expect(archivo.userId).toBeUndefined();
      expect(await enUploads()).toEqual([`${archivo.id}.${extension}`]);
      expect(await readFile(path.join(env.uploadsDir, `${archivo.id}.${extension}`), "utf8")).toBe(
        "hola mundo",
      );

      const json = JSON.parse(await readFile(path.join(env.dataDir, "archivos.json"), "utf8"));
      expect(json.archivos).toEqual([expect.objectContaining({ id: archivo.id, userId: user.id })]);
    },
  );

  it("marca como previsualizables solo JPG y PNG, con MIME fijo por extensión", async () => {
    await iniciarSesionActiva();
    const png = (await (await subir(conArchivo("a.png"))).json()).archivo;
    const psd = (await (await subir(conArchivo("a.psd"))).json()).archivo;
    expect(png).toMatchObject({ previsualizable: true, mime: "image/png" });
    expect(psd).toMatchObject({ previsualizable: false, mime: "image/vnd.adobe.photoshop" });
  });

  it.each(["programa.exe", "carta.docx", "sin-extension", "foto.jpg.exe"])(
    "%s → 415 'Formato no permitido' sin guardar nada",
    async (nombre) => {
      await iniciarSesionActiva();
      const res = await subir(conArchivo(nombre));
      expect(res.status).toBe(415);
      expect((await res.json()).error).toMatchObject({
        code: "FORMATO_NO_PERMITIDO",
        message: "Formato no permitido",
      });
      expect(await enUploads()).toEqual([]);
    },
  );

  it("Content-Length > 50 MB → 413 sin leer el cuerpo", async () => {
    await iniciarSesionActiva();
    const req = conArchivo("grande.jpg");
    const conLargo = new Request(req, {
      headers: { ...Object.fromEntries(req.headers), "content-length": String(60 * 1024 * 1024) },
    });
    const res = await subir(conLargo);
    expect(res.status).toBe(413);
    expect((await res.json()).error.message).toBe("El archivo supera 50 MB");
    expect(conLargo.bodyUsed).toBe(false);
    expect(await enUploads()).toEqual([]);
  });

  it("contenido > 50 MB sin Content-Length → 413 y no queda nada en uploads/", async () => {
    await iniciarSesionActiva();
    const res = await subir(conArchivo("grande.png", new Uint8Array(TAMANO_MAXIMO_ARCHIVO_BYTES + 1)));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("ARCHIVO_MUY_GRANDE");
    expect(await enUploads()).toEqual([]);
  });

  it("exactamente 50 MB se acepta", async () => {
    await iniciarSesionActiva();
    const res = await subir(conArchivo("justo.png", new Uint8Array(TAMANO_MAXIMO_ARCHIVO_BYTES)));
    expect(res.status).toBe(201);
    expect((await res.json()).archivo.bytes).toBe(TAMANO_MAXIMO_ARCHIVO_BYTES);
  });

  it("sin el campo 'archivo' → 422", async () => {
    await iniciarSesionActiva();
    const res = await subir(conArchivo("a.jpg", "x", "otro"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ archivo: "Elige un archivo" });
  });

  it("un cuerpo que no es multipart → 400", async () => {
    await iniciarSesionActiva();
    const res = await subir(
      new Request("http://localhost/api/archivos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/archivos/:id", () => {
  it("el dueño lo descarga con el Content-Type guardado", async () => {
    await iniciarSesionActiva();
    const { archivo } = await (await subir(conArchivo("perro.jpg", "bytes-de-imagen"))).json();

    const res = await getArchivo(archivo.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''perro.jpg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("bytes-de-imagen");
  });

  it("PDF, AI y PSD se sirven como descarga", async () => {
    await iniciarSesionActiva();
    const { archivo } = await (await subir(conArchivo("diseño final.ai"))).json();
    const res = await getArchivo(archivo.id);
    expect(res.headers.get("content-type")).toBe("application/postscript");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''dise%C3%B1o%20final.ai",
    );
  });

  it("un archivo de otro usuario → 404", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const { archivo } = await (await subir(conArchivo("privado.png"))).json();

    await iniciarSesionActiva("beto@ejemplo.com");
    const res = await getArchivo(archivo.id);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NO_ENCONTRADO");
  });

  it("un id inexistente → 404", async () => {
    await iniciarSesionActiva();
    expect((await getArchivo("no-existe")).status).toBe(404);
  });

  it("sin sesión → 401", async () => {
    const user = await iniciarSesionActiva();
    const { archivo } = await (await subir(conArchivo("a.png"))).json();
    jar.clear();
    expect((await getArchivo(archivo.id)).status).toBe(401);
    await cambiarSesion(user);
    expect((await getArchivo(archivo.id)).status).toBe(200);
  });
});
