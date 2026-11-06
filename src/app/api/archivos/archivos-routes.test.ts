import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DATA_DIR, UPLOADS_DIR y AUTH_SECRET deben existir antes de importar repositorios y storage.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/archivos-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { base, dataDir: process.env.DATA_DIR, uploadsDir: process.env.UPLOADS_DIR };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { GET as miniatura } from "./[id]/miniatura/route";
import { GET as descargar } from "./[id]/route";
import { TAMANO_MAXIMO_ARCHIVO_BYTES } from "@/lib/validation/pedidos";
import { VIGENCIA_SUBIDA_MS } from "@/server/storage/url-firmada";
import {
  confirmarSubida,
  ctxId,
  fixture,
  putFirmado,
  solicitarSubida,
  subirArchivoPrueba,
} from "@/test/archivos";
import { jar } from "@/test/next-headers-mock";
import { cambiarSesion, iniciarSesionActiva } from "@/test/sesion";

const getArchivo = (id: string) => descargar(new Request(`http://localhost/api/archivos/${id}`), ctxId(id));
const getMiniatura = (id: string) => miniatura(new Request(`http://localhost/api/archivos/${id}/miniatura`), ctxId(id));

const enTemporal = async () => {
  try {
    return (await readdir(path.join(env.uploadsDir, "temporal"))).sort();
  } catch {
    return [];
  }
};

/** Paso 1 con sesión activa: el archivo pendiente y la URL firmada. */
async function pedir(nombre: string, bytes: number) {
  const res = await solicitarSubida(nombre, bytes);
  expect(res.status).toBe(201);
  return res.json() as Promise<{ archivo: { id: string }; subida: { url: string; metodo: string; expiraEn: string } }>;
}

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  jar.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("POST /api/archivos/subidas", () => {
  it("sin sesión responde 401", async () => {
    expect((await solicitarSubida("a.jpg", 10)).status).toBe(401);
  });

  it("crea el archivo pendiente y devuelve la URL firmada de 15 minutos", async () => {
    const user = await iniciarSesionActiva();
    const antes = Date.now();
    const { archivo, subida } = await pedir("Tarjeta Final.JPG", 1234);

    expect(archivo).toMatchObject({
      nombreOriginal: "Tarjeta Final.JPG",
      extension: "jpg",
      mime: "image/jpeg",
      bytes: 1234,
      estado: "pendiente",
      metadatos: null,
      miniatura: false,
      subidoEn: null,
    });
    expect(archivo).not.toHaveProperty("userId");
    expect(archivo).not.toHaveProperty("key");

    const url = new URL(subida.url);
    expect(subida.metodo).toBe("PUT");
    expect(url.pathname).toBe(`/api/r2-local/temporal/${archivo.id}.jpg`);
    expect(url.searchParams.get("bytes")).toBe("1234");
    expect(url.searchParams.get("firma")).toMatch(/^[0-9a-f]{64}$/);
    const vigencia = Date.parse(subida.expiraEn) - antes;
    expect(vigencia).toBeGreaterThanOrEqual(VIGENCIA_SUBIDA_MS - 1000);
    expect(vigencia).toBeLessThanOrEqual(VIGENCIA_SUBIDA_MS + 1000);

    const json = JSON.parse(await readFile(path.join(env.dataDir, "archivos.json"), "utf8"));
    expect(json).toMatchObject({
      version: 2,
      archivos: [{ id: archivo.id, userId: user.id, key: `temporal/${archivo.id}.jpg` }],
    });
    expect(await enTemporal()).toEqual([]); // el binario aún no llega
  });

  it.each(["logo.png", "capas.psd", "programa.exe", "carta.docx", "sin-extension", "foto.jpg.exe"])(
    "%s → 415 'Formato no permitido' sin crear nada",
    async (nombre) => {
      await iniciarSesionActiva();
      const res = await solicitarSubida(nombre, 10);
      expect(res.status).toBe(415);
      expect((await res.json()).error).toMatchObject({ code: "FORMATO_NO_PERMITIDO", message: "Formato no permitido" });
    },
  );

  it("41 MB → 413; 40 MB exactos se aceptan", async () => {
    await iniciarSesionActiva();
    const grande = await solicitarSubida("lona.tiff", 41 * 1024 * 1024);
    expect(grande.status).toBe(413);
    expect((await grande.json()).error).toMatchObject({ code: "ARCHIVO_MUY_GRANDE", message: "El archivo supera 40 MB" });
    expect((await solicitarSubida("lona.tiff", TAMANO_MAXIMO_ARCHIVO_BYTES)).status).toBe(201);
  });

  it("sin nombre o con bytes inválidos → 422", async () => {
    await iniciarSesionActiva();
    const sinNombre = await solicitarSubida("  ", 10);
    expect(sinNombre.status).toBe(422);
    expect((await sinNombre.json()).error.fields).toEqual({ nombre: "Elige un archivo" });
    const vacio = await solicitarSubida("a.jpg", 0);
    expect((await vacio.json()).error.fields).toEqual({ bytes: "El archivo está vacío" });
  });
});

describe("PUT /api/r2-local/<key>", () => {
  it("guarda el binario en temporal/ sin pedir sesión", async () => {
    await iniciarSesionActiva();
    const { archivo, subida } = await pedir("a.pdf", 10);
    jar.clear(); // la firma autoriza, no la cookie

    expect((await putFirmado(subida.url, "hola mundo")).status).toBe(200);
    expect(await enTemporal()).toEqual([`${archivo.id}.pdf`]);
    expect(await readFile(path.join(env.uploadsDir, "temporal", `${archivo.id}.pdf`), "utf8")).toBe("hola mundo");
  });

  it("firma alterada → 403", async () => {
    await iniciarSesionActiva();
    const { subida } = await pedir("a.pdf", 10);
    const url = new URL(subida.url);
    url.searchParams.set("firma", "0".repeat(64));
    const res = await putFirmado(url.toString(), "x");
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FIRMA_INVALIDA");
    expect(await enTemporal()).toEqual([]);
  });

  it("bytes declarados alterados → 403", async () => {
    await iniciarSesionActiva();
    const { subida } = await pedir("a.pdf", 10);
    const url = new URL(subida.url);
    url.searchParams.set("bytes", String(40 * 1024 * 1024));
    expect((await putFirmado(url.toString(), "x")).status).toBe(403);
  });

  it("URL vencida (15 min + 1 ms) → 403", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    await iniciarSesionActiva();
    const { subida } = await pedir("a.pdf", 1);

    vi.setSystemTime(new Date(Date.parse("2026-11-05T12:00:00Z") + VIGENCIA_SUBIDA_MS));
    expect((await putFirmado(subida.url, "x")).status).toBe(200);
    vi.setSystemTime(new Date(Date.parse("2026-11-05T12:00:00Z") + VIGENCIA_SUBIDA_MS + 1));
    expect((await putFirmado(subida.url, "x")).status).toBe(403);
  });

  it("otra llave con la firma de la primera → 403", async () => {
    await iniciarSesionActiva();
    const primera = await pedir("a.pdf", 10);
    const segunda = await pedir("b.pdf", 10);
    const url = new URL(primera.subida.url);
    url.pathname = new URL(segunda.subida.url).pathname;
    expect((await putFirmado(url.toString(), "x")).status).toBe(403);
    expect(await enTemporal()).toEqual([]);
  });

  it("más bytes que los declarados → 413 sin dejar nada", async () => {
    await iniciarSesionActiva();
    const { subida } = await pedir("a.pdf", 5);
    const res = await putFirmado(subida.url, "123456");
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("ARCHIVO_MUY_GRANDE");
    expect(await enTemporal()).toEqual([]);
  });

  it("Content-Length mayor que lo declarado → 413 sin leer el cuerpo", async () => {
    await iniciarSesionActiva();
    const { subida } = await pedir("a.pdf", 5);
    expect((await putFirmado(subida.url, "123", { "content-length": "6" })).status).toBe(413);
  });
});

describe("POST /api/archivos/:id/confirmar", () => {
  it("flujo completo: JPG CMYK con sus píxeles, miniatura y estado subido", async () => {
    await iniciarSesionActiva();
    const contenido = await fixture("tarjeta-cmyk.jpg");
    const archivo = await subirArchivoPrueba("tarjeta.jpg", contenido);

    expect(archivo).toMatchObject({
      estado: "subido",
      bytes: contenido.byteLength,
      metadatos: { tipo: "imagen", legible: true, anchoPx: 1098, altoPx: 661, color: "CMYK" },
      miniatura: true,
    });
    expect(Number.isNaN(Date.parse(archivo.subidoEn!))).toBe(false);
    expect(await enTemporal()).toEqual([`${archivo.id}.jpg`, `${archivo.id}.jpg.miniatura.jpg`]);
    // El original no se toca.
    expect(await readFile(path.join(env.uploadsDir, "temporal", `${archivo.id}.jpg`))).toEqual(contenido);
  });

  it("RGB y TIFF CMYK", async () => {
    await iniciarSesionActiva();
    const rgb = await subirArchivoPrueba("rgb.jpg", await fixture("tarjeta-rgb.jpg"));
    expect(rgb.metadatos).toMatchObject({ color: "RGB", anchoPx: 1098, altoPx: 661 });
    const tiff = await subirArchivoPrueba("tarjeta.tiff", await fixture("tarjeta-cmyk.tiff"));
    expect(tiff).toMatchObject({ extension: "tiff", miniatura: true, metadatos: { color: "CMYK", anchoPx: 1098 } });
  });

  it("vectores: solo formato y peso, sin miniatura", async () => {
    await iniciarSesionActiva();
    const pdf = await subirArchivoPrueba("diseño.pdf", "%PDF-1.4");
    expect(pdf).toMatchObject({
      estado: "subido",
      bytes: 8,
      metadatos: { tipo: "vector", legible: true, anchoPx: null, altoPx: null, color: null },
      miniatura: false,
    });
  });

  it("una imagen que no se puede leer queda ilegible, sin miniatura", async () => {
    await iniciarSesionActiva();
    const roto = await subirArchivoPrueba("roto.jpg", "no soy un jpg");
    expect(roto).toMatchObject({ estado: "subido", metadatos: { tipo: "imagen", legible: false }, miniatura: false });
  });

  it("un TIFF renombrado a .jpg queda ilegible (el formato real no corresponde)", async () => {
    await iniciarSesionActiva();
    const falso = await subirArchivoPrueba("falso.jpg", await fixture("tarjeta-cmyk.tiff"));
    expect(falso.metadatos).toMatchObject({ legible: false });
  });

  it("los bytes reales reemplazan a los declarados", async () => {
    await iniciarSesionActiva();
    const { archivo, subida } = await pedir("a.pdf", 100);
    await putFirmado(subida.url, "corto");
    expect((await (await confirmarSubida(archivo.id)).json()).archivo.bytes).toBe(5);
  });

  it("sin binario → 409", async () => {
    await iniciarSesionActiva();
    const { archivo } = await pedir("a.jpg", 10);
    const res = await confirmarSubida(archivo.id);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ARCHIVO_NO_SUBIDO");
  });

  it("de otro usuario → 404", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const { archivo, subida } = await pedir("a.pdf", 1);
    await putFirmado(subida.url, "x");

    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await confirmarSubida(archivo.id)).status).toBe(404);
    expect((await confirmarSubida("no-existe")).status).toBe(404);
  });

  it("confirmar dos veces devuelve el mismo archivo", async () => {
    await iniciarSesionActiva();
    const archivo = await subirArchivoPrueba("a.pdf", "x");
    const otra = await confirmarSubida(archivo.id);
    expect(otra.status).toBe(200);
    expect((await otra.json()).archivo).toEqual(archivo);
  });
});

describe("GET /api/archivos/:id/miniatura", () => {
  it("JPG en sRGB de 400 px de lado mayor, solo al dueño", async () => {
    const ana = await iniciarSesionActiva("ana@ejemplo.com");
    const archivo = await subirArchivoPrueba("tarjeta.jpg", await fixture("tarjeta-cmyk.jpg"));

    const res = await getMiniatura(archivo.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: "jpeg", space: "srgb", width: 400, height: 241 });

    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await getMiniatura(archivo.id)).status).toBe(404);
    jar.clear();
    expect((await getMiniatura(archivo.id)).status).toBe(401);
    await cambiarSesion(ana);
    expect((await getMiniatura(archivo.id)).status).toBe(200);
  });

  it("un vector no tiene miniatura → 404", async () => {
    await iniciarSesionActiva();
    const pdf = await subirArchivoPrueba("a.pdf", "x");
    expect((await getMiniatura(pdf.id)).status).toBe(404);
  });
});

describe("GET /api/archivos/:id", () => {
  it("el dueño ve el JPG en línea con el Content-Type fijo", async () => {
    await iniciarSesionActiva();
    const contenido = await fixture("tarjeta-cmyk.jpg");
    const archivo = await subirArchivoPrueba("perro.jpg", contenido);

    const res = await getArchivo(archivo.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''perro.jpg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(contenido);
  });

  it.each([
    ["diseño final.ai", "application/postscript"],
    ["logo.svg", "image/svg+xml"],
    ["tarjeta.tiff", "image/tiff"],
  ])("%s se sirve como descarga", async (nombre, mime) => {
    await iniciarSesionActiva();
    const archivo = await subirArchivoPrueba(nombre, "x");
    const res = await getArchivo(archivo.id);
    expect(res.headers.get("content-type")).toBe(mime);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  });

  it("uno pendiente → 404", async () => {
    await iniciarSesionActiva();
    const { archivo, subida } = await pedir("a.pdf", 1);
    await putFirmado(subida.url, "x");
    expect((await getArchivo(archivo.id)).status).toBe(404);
  });

  it("de otro usuario o inexistente → 404; sin sesión → 401", async () => {
    const ana = await iniciarSesionActiva("ana@ejemplo.com");
    const archivo = await subirArchivoPrueba("privado.jpg", "x");

    await iniciarSesionActiva("beto@ejemplo.com");
    const ajeno = await getArchivo(archivo.id);
    expect(ajeno.status).toBe(404);
    expect((await ajeno.json()).error.code).toBe("NO_ENCONTRADO");
    expect((await getArchivo("no-existe")).status).toBe(404);

    jar.clear();
    expect((await getArchivo(archivo.id)).status).toBe(401);
    await cambiarSesion(ana);
    expect((await getArchivo(archivo.id)).status).toBe(200);
  });
});
