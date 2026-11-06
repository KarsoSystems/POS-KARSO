import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { IMAGENES } from "../../e2e/fixtures/generar-imagenes.mjs";

// Las imágenes de prueba de la SPEC 05 están versionadas; si alguien las cambia
// o no las regenera, los tests de validación dejarían de probar lo que dicen.
const FIXTURES = path.join(process.cwd(), "e2e", "fixtures");

interface ImagenPrueba {
  nombre: string;
  ancho: number;
  alto: number;
  color: "cmyk" | "srgb";
  formato: "jpeg" | "tiff";
}

describe("imágenes de prueba (e2e/fixtures)", () => {
  it.each(IMAGENES as ImagenPrueba[])("$nombre: $formato $color $ancho × $alto", async (imagen) => {
    const metadatos = await sharp(path.join(FIXTURES, imagen.nombre)).metadata();
    expect(metadatos).toMatchObject({
      format: imagen.formato,
      space: imagen.color,
      width: imagen.ancho,
      height: imagen.alto,
    });
  });
});
