import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { bannersArchivoSchema, type BannersArchivo } from "@/lib/banners/schema";
import { productosArchivoSchema, type ProductosArchivo } from "@/lib/catalogo/schema";

// Datos que administrará el panel de KARSO (otro proyecto), simulados con JSON
// versionados en git. Tienen la forma que devolverá el backend real.

const MOCK_PANEL_DIR = path.join(process.cwd(), "config", "mock-panel");
export const PRODUCTOS_PATH = path.join(MOCK_PANEL_DIR, "productos.json");
export const BANNERS_PATH = path.join(MOCK_PANEL_DIR, "banners.json");

/** `PRODUCTOS_PATH` del entorno si está definida (tests, e2e); si no, el de git. */
export function resolveProductosPath(): string {
  return process.env.PRODUCTOS_PATH ?? PRODUCTOS_PATH;
}

/** `BANNERS_PATH` del entorno si está definida (tests, e2e); si no, el de git. */
export function resolveBannersPath(): string {
  return process.env.BANNERS_PATH ?? BANNERS_PATH;
}

export class MockPanelInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockPanelInvalidoError";
  }
}

/** Valida datos ya parseados; lanza `MockPanelInvalidoError` con la ruta de cada campo que falla. */
function validar<T>(schema: z.ZodType<T>, data: unknown, origen: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("; ");
    throw new MockPanelInvalidoError(`${origen} inválido → ${detalle}`);
  }
  return result.data;
}

export const validarProductos = (data: unknown, origen = "productos.json"): ProductosArchivo =>
  validar(productosArchivoSchema, data, origen);

export const validarBanners = (data: unknown, origen = "banners.json"): BannersArchivo =>
  validar(bannersArchivoSchema, data, origen);

async function leerJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new MockPanelInvalidoError(`${filePath} no es JSON válido: ${(error as Error).message}`);
  }
}

/**
 * Lee y valida en cada llamada: un cambio en el JSON se refleja sin reiniciar
 * el servidor (el borrador se recalcula al leerse).
 */
export async function cargarProductos(filePath: string = resolveProductosPath()): Promise<ProductosArchivo> {
  return validarProductos(await leerJson(filePath), filePath);
}

export async function cargarBanners(filePath: string = resolveBannersPath()): Promise<BannersArchivo> {
  return validarBanners(await leerJson(filePath), filePath);
}
