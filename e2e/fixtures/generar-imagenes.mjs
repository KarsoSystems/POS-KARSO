// Genera las imágenes de prueba de la SPEC 05 (validación de archivos, KARSO 5.7).
// Son de un solo color, así que pesan poco aunque tengan muchos píxeles.
// Uso: node e2e/fixtures/generar-imagenes.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Tarjeta 8.7 × 5 cm + 0.3 cm de rebase por lado = 9.3 × 5.6 cm; a 300 dpi = 1098 × 661 px.
// Lona 2.00 × 1.50 m a 100 dpi = 7874 × 5906 px.
export const IMAGENES = [
  { nombre: "tarjeta-cmyk.jpg", ancho: 1098, alto: 661, color: "cmyk", formato: "jpeg" },
  { nombre: "tarjeta-cmyk-600dpi.jpg", ancho: 2196, alto: 1322, color: "cmyk", formato: "jpeg" },
  { nombre: "tarjeta-cmyk-girada.jpg", ancho: 661, alto: 1098, color: "cmyk", formato: "jpeg" },
  { nombre: "tarjeta-rgb.jpg", ancho: 1098, alto: 661, color: "srgb", formato: "jpeg" },
  { nombre: "tarjeta-baja-resolucion.jpg", ancho: 549, alto: 331, color: "cmyk", formato: "jpeg" },
  { nombre: "tarjeta-medida-incorrecta.jpg", ancho: 1098, alto: 600, color: "cmyk", formato: "jpeg" },
  { nombre: "tarjeta-cmyk.tiff", ancho: 1098, alto: 661, color: "cmyk", formato: "tiff" },
  { nombre: "lona-cmyk.jpg", ancho: 7874, alto: 5906, color: "cmyk", formato: "jpeg" },
];

async function generar({ nombre, ancho, alto, color, formato }) {
  const imagen = sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 245, g: 184, b: 61 } },
  }).toColourspace(color);
  const salida = formato === "tiff" ? imagen.tiff({ compression: "lzw" }) : imagen.jpeg({ quality: 80 });
  await salida.toFile(path.join(dir, nombre));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const imagen of IMAGENES) await generar(imagen);
  console.log(`${IMAGENES.length} imágenes generadas en ${dir}`);
}
