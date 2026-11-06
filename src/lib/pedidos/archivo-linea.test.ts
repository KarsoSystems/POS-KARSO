import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Producto, ProductosArchivo } from "@/lib/catalogo/schema";
import {
  aniosCalendario,
  entradaDeArchivos,
  evaluarArchivos,
  idsDeArchivos,
  medidaEsperadaDe,
  reglasDe,
  validarArchivo,
  type ArchivoAValidar,
  type ArchivoDisponible,
  type MedidaEsperada,
} from "./archivo-linea";
import { resolverMedida } from "./cotizacion";

// Ejemplos de KARSO-PROMPT-v1.md 5.7 sobre el mock del panel, con los píxeles de
// las imágenes de e2e/fixtures (generar-imagenes.mjs).
const { productos }: ProductosArchivo = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "mock-panel", "productos.json"), "utf8"),
);
const prod = (nombre: string): Producto => productos.find((p) => p.nombre === nombre)!;
const variante = (producto: Producto, sku: string) => producto.variantes.find((v) => v.sku === sku)!;

const tarjeta = prod("Tarjeta");
const couche = variante(tarjeta, "70000177"); // 8.7 × 5 cm, rebase 0.3
const reglasTarjeta = reglasDe(tarjeta, couche);
const medidaTarjeta = medidaEsperadaDe(couche, resolverMedida(couche, null));

const lona = prod("Lona 13 oz.");
const lona100 = variante(lona, "70000178");
const reglasLona = reglasDe(lona, lona100);
const medidaLona = medidaEsperadaDe(lona100, resolverMedida(lona100, { ancho: 2, alto: 1.5 }));

const imagen = (anchoPx: number, altoPx: number, cambios: Partial<ArchivoAValidar> = {}): ArchivoAValidar => ({
  extension: "jpg",
  bytes: 46_000,
  metadatos: { tipo: "imagen", legible: true, anchoPx, altoPx, color: "CMYK" },
  ...cambios,
});

const codigos = (resultado: ReturnType<typeof validarArchivo>) => resultado.advertencias.map((a) => a.codigo);
const mensaje = (resultado: ReturnType<typeof validarArchivo>, codigo: string) =>
  resultado.advertencias.find((a) => a.codigo === codigo)?.mensaje;

describe("reglasDe y medidaEsperadaDe", () => {
  it("la variante sobrescribe las reglas del producto", () => {
    expect(reglasDe(lona, variante(lona, "70000181")).resolucionMinima).toBe(150);
    expect(reglasLona.resolucionMinima).toBe(100);
  });

  it("tarjeta 8.7 × 5 cm con rebase de 0.3 cm por lado → 9.3 × 5.6 cm", () => {
    expect(medidaTarjeta).toEqual({ unidad: "cm", ancho: 9.3, alto: 5.6, tolerancia: 0.1, permiteGirar: true });
  });

  it("lona: la medida capturada, sin rebase", () => {
    expect(medidaLona).toMatchObject({ unidad: "m", ancho: 2, alto: 1.5, tolerancia: 0.02 });
  });

  it("metro lineal: el ancho fijo por el largo capturado", () => {
    const iman = variante(prod("Imán"), "70000303");
    expect(medidaEsperadaDe(iman, resolverMedida(iman, { ancho: 3, alto: 4 }))).toMatchObject({
      ancho: 0.56,
      alto: 4,
      permiteGirar: false,
    });
  });
});

describe("validarArchivo", () => {
  it("tarjeta de 1098 × 661 px pasa a 300 dpi", () => {
    expect(validarArchivo(reglasTarjeta, medidaTarjeta, imagen(1098, 661))).toEqual({
      resolucion: 300,
      validado: true,
      advertencias: [],
    });
  });

  it("2196 × 1322 px (600 dpi) pasa: se pide al menos la mínima", () => {
    expect(validarArchivo(reglasTarjeta, medidaTarjeta, imagen(2196, 1322))).toMatchObject({
      resolucion: 600,
      validado: true,
    });
  });

  it("girada (661 × 1098) pasa con permiteGirar y no sin él", () => {
    expect(validarArchivo(reglasTarjeta, medidaTarjeta, imagen(661, 1098))).toMatchObject({
      resolucion: 300,
      validado: true,
    });
    const sinGirar: MedidaEsperada = { ...medidaTarjeta, permiteGirar: false };
    expect(codigos(validarArchivo(reglasTarjeta, sinGirar, imagen(661, 1098)))).toContain("medida");
  });

  it("RGB da color", () => {
    const resultado = validarArchivo(reglasTarjeta, medidaTarjeta, imagen(1098, 661, {
      metadatos: { tipo: "imagen", legible: true, anchoPx: 1098, altoPx: 661, color: "RGB" },
    }));
    expect(codigos(resultado)).toEqual(["color"]);
    expect(mensaje(resultado, "color")).toBe("El archivo está en RGB; se requiere CMYK");
  });

  it("549 × 331 px da resolución, con el mínimo en px", () => {
    const resultado = validarArchivo(reglasTarjeta, medidaTarjeta, imagen(549, 331));
    expect(codigos(resultado)).toEqual(["resolucion"]);
    expect(resultado.resolucion).toBe(150);
    expect(mensaje(resultado, "resolucion")).toBe(
      "Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)",
    );
  });

  it("1098 × 600 px da medida", () => {
    const resultado = validarArchivo(reglasTarjeta, medidaTarjeta, imagen(1098, 600));
    expect(codigos(resultado)).toEqual(["medida"]);
    expect(mensaje(resultado, "medida")).toBe(
      "La medida no corresponde: a 9.3 cm de ancho el archivo mide 9.3 × 5.1 cm; se esperaba 9.3 × 5.6 cm (± 0.1 cm)",
    );
  });

  it("lona de 7874 × 5906 px a 2.00 × 1.50 m pasa a 100 dpi", () => {
    expect(validarArchivo(reglasLona, medidaLona, imagen(7874, 5906))).toMatchObject({
      resolucion: 100,
      validado: true,
    });
  });

  it("lona chica da el mínimo en px de KARSO (7874 × 5906)", () => {
    expect(mensaje(validarArchivo(reglasLona, medidaLona, imagen(3937, 2953)), "resolucion")).toBe(
      "Resolución efectiva de 50 dpi; se requieren al menos 100 dpi (mínimo 7874 × 5906 px)",
    );
  });

  it("PDF: solo formato y peso", () => {
    const pdf: ArchivoAValidar = {
      extension: "pdf",
      bytes: 45.2 * 1024 * 1024,
      metadatos: { tipo: "vector", legible: true, anchoPx: null, altoPx: null, color: null },
    };
    const resultado = validarArchivo(reglasTarjeta, medidaTarjeta, pdf);
    expect(resultado.resolucion).toBeNull();
    expect(resultado.advertencias).toEqual([
      { codigo: "formato", mensaje: "Formato PDF no permitido para este producto; se aceptan JPG, JPEG y TIFF" },
      { codigo: "peso", mensaje: "Pesa 45.2 MB; el máximo es 40 MB" },
    ]);
  });

  it("PDF permitido y ligero pasa", () => {
    const reglas = { ...reglasTarjeta, formatos: ["pdf"] };
    const pdf: ArchivoAValidar = {
      extension: "PDF",
      bytes: 1000,
      metadatos: { tipo: "vector", legible: true, anchoPx: null, altoPx: null, color: null },
    };
    expect(validarArchivo(reglas, medidaTarjeta, pdf).validado).toBe(true);
  });

  it("formato fuera de la variante da formato", () => {
    const reglas = reglasDe(tarjeta, { archivo: { formatos: ["tiff"] } });
    expect(mensaje(validarArchivo(reglas, medidaTarjeta, imagen(1098, 661)), "formato")).toBe(
      "Formato JPG no permitido para este producto; se aceptan TIFF",
    );
  });

  it("peso de más da peso", () => {
    const resultado = validarArchivo(reglasTarjeta, medidaTarjeta, imagen(1098, 661, { bytes: 40 * 1024 * 1024 + 1 }));
    expect(codigos(resultado)).toEqual(["peso"]);
    expect(validarArchivo(reglasTarjeta, medidaTarjeta, imagen(1098, 661, { bytes: 40 * 1024 * 1024 })).validado).toBe(true);
  });

  it("ilegible da ilegible y no revisa color, resolución ni medida", () => {
    const resultado = validarArchivo(reglasTarjeta, medidaTarjeta, {
      extension: "jpg",
      bytes: 1000,
      metadatos: { tipo: "imagen", legible: false, anchoPx: null, altoPx: null, color: null },
    });
    expect(resultado).toEqual({
      resolucion: null,
      validado: false,
      advertencias: [{ codigo: "ilegible", mensaje: "No se pudo leer la imagen; mostrador la revisará" }],
    });
  });

  it("sin validarMedida ni medida esperada no revisa medida ni resolución", () => {
    const chica = imagen(549, 600);
    expect(validarArchivo({ ...reglasTarjeta, validarMedida: false }, medidaTarjeta, chica).validado).toBe(true);
    expect(validarArchivo(reglasTarjeta, null, chica).validado).toBe(true);
  });

  it("colorRequerido cualquiera acepta RGB", () => {
    const rgb = imagen(1098, 661, { metadatos: { tipo: "imagen", legible: true, anchoPx: 1098, altoPx: 661, color: "RGB" } });
    expect(validarArchivo({ ...reglasTarjeta, colorRequerido: "cualquiera" }, medidaTarjeta, rgb).validado).toBe(true);
  });
});

describe("aniosCalendario", () => {
  it("usa el año de Monterrey: el 1 de enero a las 05:00 UTC todavía es 31 de diciembre allá", () => {
    expect(aniosCalendario(new Date("2027-01-01T05:00:00Z"))).toEqual([2026, 2027]);
    expect(aniosCalendario(new Date("2027-01-01T07:00:00Z"))).toEqual([2027, 2028]);
  });
});

describe("evaluarArchivos", () => {
  const ahora = new Date("2026-11-05T12:00:00Z");
  const disponible = (id: string, cambios: Partial<ArchivoDisponible> = {}): ArchivoDisponible => ({
    id,
    nombreOriginal: `${id}.jpg`,
    extension: "jpg",
    bytes: 46_000,
    estado: "subido",
    metadatos: { tipo: "imagen", legible: true, anchoPx: 1098, altoPx: 661, color: "CMYK" },
    subidoEn: "2026-11-05T11:00:00.000Z",
    ...cambios,
  });
  const disponibles = { f: disponible("f"), r: disponible("r", { metadatos: { tipo: "imagen", legible: true, anchoPx: 1098, altoPx: 661, color: "RGB" } }) };
  const laminada = variante(tarjeta, "70000180");
  const evaluar = (v: typeof couche, entrada: Parameters<typeof evaluarArchivos>[3]) =>
    evaluarArchivos(tarjeta, v, resolverMedida(v, null), entrada, disponibles, ahora);

  it("copia los datos de cada cara con su validación", () => {
    const resultado = evaluar(couche, { frente: "f", reverso: { tipo: "archivo", archivoId: "r" } });
    expect(resultado).toEqual({
      ok: true,
      archivos: {
        frente: {
          archivoId: "f",
          nombreOriginal: "f.jpg",
          formato: "jpg",
          color: "CMYK",
          anchoPx: 1098,
          altoPx: 661,
          resolucion: 300,
          pesoMB: 0,
          validado: true,
          advertencias: [],
          subidoEn: "2026-11-05T11:00:00.000Z",
        },
        reverso: expect.objectContaining({ tipo: "archivo", archivoId: "r", validado: false }),
      },
    });
    if (resultado.ok) {
      expect(idsDeArchivos(resultado.archivos)).toEqual(["f", "r"]);
      expect(entradaDeArchivos(resultado.archivos)).toEqual({ frente: "f", reverso: { tipo: "archivo", archivoId: "r" } });
    }
  });

  it("errores de estructura por cara", () => {
    expect(evaluar(couche, { frente: null, reverso: null })).toMatchObject({ ok: false, campo: "archivos.frente" });
    expect(evaluar(couche, { frente: "x", reverso: null })).toMatchObject({ mensaje: "El archivo no existe" });
    expect(evaluar(laminada, { frente: "f", reverso: null })).toMatchObject({ campo: "archivos.reverso", mensaje: "Elige el reverso" });
    expect(evaluar(couche, { frente: "f", reverso: { tipo: "calendario", anio: 2025 } })).toMatchObject({
      mensaje: "Elige el calendario de 2026 o 2027",
    });
    const sinReverso = { ...couche, caras: { frente: "obligatorio" as const, reverso: "no_aplica" as const } };
    expect(evaluar(sinReverso, { frente: "f", reverso: { tipo: "texto", texto: "x" } })).toMatchObject({
      mensaje: "Este producto no lleva reverso",
    });
  });

  it("calendario y texto no llevan archivo ni costo", () => {
    const resultado = evaluar(laminada, { frente: "f", reverso: { tipo: "calendario", anio: 2027 } });
    expect(resultado).toMatchObject({ ok: true, archivos: { reverso: { tipo: "calendario", anio: 2027 } } });
    if (resultado.ok) expect(idsDeArchivos(resultado.archivos)).toEqual(["f"]);
  });
});
