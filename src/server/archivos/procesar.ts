import sharp from "sharp";
import { esImagen, type ExtensionPermitida } from "@/lib/validation/pedidos";
import type { ColorArchivo, MetadatosArchivo } from "@/server/domain/archivo";

// Lo que el servidor saca del archivo al confirmarlo (SPEC 05): píxeles, color y
// formato real de JPG y TIFF, más una miniatura JPG en sRGB para mostrarla en el
// navegador (que no dibuja CMYK ni TIFF). El original no se toca. De los vectores
// (PDF, AI, EPS, SVG) no se lee nada: solo cuentan formato y peso.

export const LADO_MINIATURA_PX = 400;

const FORMATO_SHARP: Partial<Record<ExtensionPermitida, string>> = { jpg: "jpeg", jpeg: "jpeg", tiff: "tiff" };

function colorDe(space: string | undefined): ColorArchivo {
  if (space === "cmyk") return "CMYK";
  if (space === "srgb" || space === "rgb") return "RGB";
  return "otro";
}

const ILEGIBLE: MetadatosArchivo = { tipo: "imagen", legible: false, anchoPx: null, altoPx: null, color: null };

export async function procesarArchivo(
  extension: ExtensionPermitida,
  contenido: Buffer,
): Promise<{ metadatos: MetadatosArchivo; miniatura: Buffer | null }> {
  if (!esImagen(extension)) {
    return { metadatos: { tipo: "vector", legible: true, anchoPx: null, altoPx: null, color: null }, miniatura: null };
  }

  let metadatos: MetadatosArchivo;
  try {
    const leidos = await sharp(contenido).metadata();
    // Un PNG renombrado a .jpg no es lo que dice ser: queda ilegible y mostrador lo revisa.
    if (leidos.format !== FORMATO_SHARP[extension] || !leidos.width || !leidos.height) {
      return { metadatos: ILEGIBLE, miniatura: null };
    }
    metadatos = { tipo: "imagen", legible: true, anchoPx: leidos.width, altoPx: leidos.height, color: colorDe(leidos.space) };
  } catch {
    return { metadatos: ILEGIBLE, miniatura: null };
  }

  try {
    const miniatura = await sharp(contenido)
      .rotate() // respeta la orientación EXIF
      .resize(LADO_MINIATURA_PX, LADO_MINIATURA_PX, { fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .jpeg({ quality: 80 })
      .toBuffer();
    return { metadatos, miniatura };
  } catch {
    // Sin miniatura el archivo sigue siendo válido; el front muestra un ícono.
    return { metadatos, miniatura: null };
  }
}
