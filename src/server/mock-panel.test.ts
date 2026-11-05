import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProductosArchivo } from "@/lib/catalogo/schema";
import {
  BANNERS_PATH,
  MockPanelInvalidoError,
  PRODUCTOS_PATH,
  cargarBanners,
  cargarProductos,
  validarBanners,
  validarProductos,
} from "./mock-panel";

let productos: ProductosArchivo;
let banners: Record<string, unknown>;
let dir: string;

beforeAll(async () => {
  productos = JSON.parse(await readFile(PRODUCTOS_PATH, "utf8"));
  banners = JSON.parse(await readFile(BANNERS_PATH, "utf8"));
  dir = await mkdtemp(path.join(tmpdir(), "mock-panel-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const copia = () => structuredClone(productos);
const variantesDe = (archivo: ProductosArchivo, nombre: string) =>
  archivo.productos.find((p) => p.nombre === nombre)!.variantes;

describe("mock del panel de ejemplo", () => {
  it("productos.json pasa la validación con el contenido de KARSO", async () => {
    const archivo = await cargarProductos();
    expect(archivo.ejemplo).toBe(true);
    expect(archivo.productos.map((p) => p.nombre)).toEqual(["Tarjeta", "Volante", "Lona 13 oz.", "Imán", "Adhesivo"]);
    expect(variantesDe(archivo, "Volante")).toHaveLength(19);
    expect(variantesDe(archivo, "Tarjeta").find((v) => v.sku === "70000177")).toMatchObject({
      precio: 115,
      volumen: "millar",
      grupoArmado: "Tarjetas Couché",
    });
    expect(variantesDe(archivo, "Lona 13 oz.").find((v) => v.sku === "70000179")?.canales).toEqual(["mostrador"]);
  });

  it("banners.json pasa la validación", async () => {
    const archivo = await cargarBanners();
    expect(archivo.banners).toHaveLength(4);
  });
});

describe("productos inválidos", () => {
  it("un SKU repetido falla e indica el campo", () => {
    const invalido = copia();
    const tarjetas = invalido.productos[0].variantes;
    tarjetas[1].sku = tarjetas[0].sku;

    expect(() => validarProductos(invalido)).toThrow(MockPanelInvalidoError);
    expect(() => validarProductos(invalido)).toThrow(/productos\.0\.variantes\.1\.sku: SKU repetido: "70000177"/);
  });

  it("un SKU repetido entre productos también falla", () => {
    const invalido = copia();
    invalido.productos[1].variantes[0].sku = invalido.productos[0].variantes[0].sku;
    expect(() => validarProductos(invalido)).toThrow(/productos\.1\.variantes\.0\.sku: SKU repetido/);
  });

  it("una variante fija con min ≠ max falla", () => {
    const invalido = copia();
    invalido.productos[0].variantes[0].medida.ancho.max = 9;
    expect(() => validarProductos(invalido)).toThrow(
      /productos\.0\.variantes\.0\.medida\.ancho\.max: En medida fija, min y max deben ser iguales/,
    );
  });

  it("una especificación con una variante inexistente falla", () => {
    const invalido = copia();
    invalido.productos[0].especificaciones[0].variantes = ["variante-fantasma"];
    expect(() => validarProductos(invalido)).toThrow(
      /productos\.0\.especificaciones\.0\.variantes\.0: La variante "variante-fantasma" no existe en el producto/,
    );
  });

  it("volumen paquete sin piezasPorPaquete falla", () => {
    const invalido = copia();
    const paquete = variantesDe(invalido, "Imán").find((v) => v.volumen === "paquete")!;
    paquete.piezasPorPaquete = null;
    expect(() => validarProductos(invalido)).toThrow(/piezasPorPaquete es obligatorio con volumen paquete/);
  });

  it("por_pieza sin cadaMetros falla", () => {
    const invalido = copia();
    const lona = invalido.productos.find((p) => p.nombre === "Lona 13 oz.")!;
    delete lona.especificaciones.find((e) => e.tipoCobro === "por_pieza")!.cadaMetros;
    expect(() => validarProductos(invalido)).toThrow(/cadaMetros es obligatorio con por_pieza/);
  });

  it("cargarProductos lanza con la ruta del campo si el archivo es inválido", async () => {
    const archivo = path.join(dir, "productos.json");
    const invalido = copia() as unknown as { productos: Record<string, unknown>[] };
    invalido.productos[0].orden = "primero";
    await writeFile(archivo, JSON.stringify(invalido));
    await expect(cargarProductos(archivo)).rejects.toThrow(/productos\.0\.orden/);
  });

  it("cargarProductos lanza si el archivo no es JSON", async () => {
    const archivo = path.join(dir, "roto.json");
    await writeFile(archivo, "{ no es json");
    await expect(cargarProductos(archivo)).rejects.toThrow(MockPanelInvalidoError);
  });
});

describe("banners inválidos", () => {
  it("una vigencia con inicio posterior al fin falla", () => {
    const invalido = structuredClone(banners) as { banners: { vigencia: unknown }[] };
    invalido.banners[0].vigencia = { inicio: "2026-12-01T00:00:00Z", fin: "2026-11-01T00:00:00Z" };
    expect(() => validarBanners(invalido)).toThrow(/banners\.0\.vigencia\.inicio/);
  });

  it("un id repetido falla", () => {
    const invalido = structuredClone(banners) as { banners: { _id: string }[] };
    invalido.banners[1]._id = invalido.banners[0]._id;
    expect(() => validarBanners(invalido)).toThrow(/banners\.1\._id: Id repetido/);
  });
});
