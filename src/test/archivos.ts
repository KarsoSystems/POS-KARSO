// Subida de archivos en tests de route handlers, con los tres pasos de la SPEC 05.
// Requiere sesión activa (src/test/sesion.ts) y DATA_DIR/UPLOADS_DIR/AUTH_SECRET.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { POST as confirmar } from "@/app/api/archivos/[id]/confirmar/route";
import { POST as pedirSubida } from "@/app/api/archivos/subidas/route";
import { PUT as subirBinario } from "@/app/api/r2-local/[...key]/route";
import type { PublicArchivo } from "@/server/domain/archivo";

export const FIXTURES = path.join(process.cwd(), "e2e", "fixtures");

/** Contenido de una imagen de e2e/fixtures (generar-imagenes.mjs). */
export const fixture = (nombre: string) => readFile(path.join(FIXTURES, nombre));

const json = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });

/** Paso 1: POST /api/archivos/subidas. */
export const solicitarSubida = (nombre: string, bytes: number) =>
  pedirSubida(json("http://localhost/api/archivos/subidas", { nombre, bytes }));

/** Paso 2: PUT a la URL firmada (absoluta, como la devuelve el paso 1). */
export function putFirmado(url: string, contenido: Uint8Array | string, headers: Record<string, string> = {}) {
  const { pathname } = new URL(url);
  const key = decodeURIComponent(pathname.slice("/api/r2-local/".length)).split("/");
  const body = typeof contenido === "string" ? new TextEncoder().encode(contenido) : contenido;
  return subirBinario(
    new Request(url, { method: "PUT", body: new Uint8Array(body), headers, duplex: "half" } as RequestInit),
    { params: Promise.resolve({ key }) },
  );
}

/** Paso 3: POST /api/archivos/:id/confirmar. */
export const confirmarSubida = (id: string) =>
  confirmar(new Request(`http://localhost/api/archivos/${id}/confirmar`, { method: "POST" }), ctxId(id));

/** Los tres pasos; lanza si alguno falla. */
export async function subirArchivoPrueba(nombre: string, contenido: Uint8Array | string = "contenido"): Promise<PublicArchivo> {
  const bytes = typeof contenido === "string" ? new TextEncoder().encode(contenido).byteLength : contenido.byteLength;
  const paso1 = await solicitarSubida(nombre, bytes);
  if (paso1.status !== 201) throw new Error(`subidas → ${paso1.status}: ${await paso1.text()}`);
  const { archivo, subida } = await paso1.json();
  const paso2 = await putFirmado(subida.url, contenido);
  if (paso2.status !== 200) throw new Error(`PUT → ${paso2.status}: ${await paso2.text()}`);
  const paso3 = await confirmarSubida(archivo.id);
  if (paso3.status !== 200) throw new Error(`confirmar → ${paso3.status}: ${await paso3.text()}`);
  return (await paso3.json()).archivo;
}
