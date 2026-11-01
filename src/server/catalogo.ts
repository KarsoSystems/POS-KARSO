import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextResponse } from "next/server";
import { catalogoSchema, type Catalogo } from "@/lib/catalogo/schema";
import { apiError } from "@/server/http/responses";

/** Ruta del catálogo versionado en git. */
export const CATALOGO_PATH = path.join(process.cwd(), "config", "catalogo.json");

/** `CATALOGO_PATH` del entorno si está definida (tests, e2e); si no, el de git. */
export function resolveCatalogoPath(): string {
  return process.env.CATALOGO_PATH ?? CATALOGO_PATH;
}

export class CatalogoInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogoInvalidoError";
  }
}

/** Valida datos ya parseados; lanza `CatalogoInvalidoError` con la ruta de cada campo que falla. */
export function validarCatalogo(data: unknown, origen = "catalogo.json"): Catalogo {
  const result = catalogoSchema.safeParse(data);
  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("; ");
    throw new CatalogoInvalidoError(`${origen} inválido → ${detalle}`);
  }
  return result.data;
}

/**
 * Lee y valida el catálogo en cada llamada: así un cambio de precios en el JSON
 * se refleja sin reiniciar el servidor (el borrador se recalcula al leerse).
 */
export async function cargarCatalogo(filePath: string = resolveCatalogoPath()): Promise<Catalogo> {
  const raw = await readFile(filePath, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new CatalogoInvalidoError(`${filePath} no es JSON válido: ${(error as Error).message}`);
  }
  return validarCatalogo(data, filePath);
}

/**
 * Para route handlers: `{ catalogo }` o `{ response }` con 500. El detalle (ruta
 * del campo que falla) va al log del servidor, no al cliente.
 */
export async function catalogoParaRuta(): Promise<
  { catalogo: Catalogo; response?: never } | { catalogo?: never; response: NextResponse }
> {
  try {
    return { catalogo: await cargarCatalogo() };
  } catch (error) {
    console.error("[catalogo]", (error as Error).message);
    return { response: apiError(500, "CATALOGO_INVALIDO", "El catálogo no está disponible") };
  }
}
