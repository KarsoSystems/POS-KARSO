import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProductosArchivo } from "@/lib/catalogo/schema";
import {
  BANNERS_PATH,
  CONFIGURACION_PATH,
  MockPanelInvalidoError,
  PRODUCTOS_PATH,
  PROMOCIONES_PATH,
  SUCURSALES_PATH,
  cargarBanners,
  cargarConfiguracion,
  cargarProductos,
  cargarPromociones,
  cargarSucursales,
  validarBanners,
  validarConfiguracion,
  validarProductos,
  validarPromociones,
  validarSucursales,
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

  it("sucursales.json: las 3 sucursales, KARSO Centro como en KARSO 6.3", async () => {
    const archivo = await cargarSucursales();
    expect(archivo.ejemplo).toBe(true);
    expect(archivo.sucursales.map((s) => s.nombre)).toEqual(["KARSO Centro", "KARSO Cumbres", "KARSO San Nicolás"]);
    expect(archivo.sucursales[0]).toMatchObject({ _id: "6720a1f0c1a2b3c4d5e60100", clave: 0, telefono: "8180001111" });
  });

  it("promociones.json: los 7 códigos de prueba", async () => {
    const { promociones } = await cargarPromociones();
    expect(promociones.map((p) => p.codigo)).toEqual([
      "BUENFIN10",
      "KARSO10",
      "BIENVENIDA5",
      "MAYOREO25",
      "VERANO15",
      "SUCURSAL20",
      "PAUSA30",
    ]);
    expect(promociones[0]).toMatchObject({ porcentaje: 10, vigencia: { inicio: "2026-11-13T06:00:00Z" } });
  });

  it("configuracion.json: IVA 16 %, 2 códigos, suma y tope de 30 %", async () => {
    expect((await cargarConfiguracion()).configuracion).toEqual({
      zonaHoraria: "America/Monterrey",
      iva: { tasa: 0.16 },
      promociones: { maxCodigosPorPedido: 2, modoCombinacion: "suma", descuentoMaximoPorcentaje: 30 },
    });
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

describe("sucursales, promociones y configuración inválidas", () => {
  const leer = async (ruta: string) => JSON.parse(await readFile(ruta, "utf8"));

  it("una sucursal con clave repetida o teléfono de 8 dígitos falla", async () => {
    const sucursales = await leer(SUCURSALES_PATH);
    sucursales.sucursales[1].clave = 0;
    expect(() => validarSucursales(sucursales)).toThrow(/sucursales\.1\.clave: Clave repetida: 0/);
    const telefono = await leer(SUCURSALES_PATH);
    telefono.sucursales[0].telefono = "80001111";
    expect(() => validarSucursales(telefono)).toThrow(/sucursales\.0\.telefono/);
  });

  it("un código en minúsculas, repetido o de más de 100 % falla", async () => {
    const minusculas = await leer(PROMOCIONES_PATH);
    minusculas.promociones[0].codigo = "buenfin10";
    expect(() => validarPromociones(minusculas)).toThrow(/promociones\.0\.codigo: El código debe ir en mayúsculas/);
    const repetido = await leer(PROMOCIONES_PATH);
    repetido.promociones[1].codigo = "BUENFIN10";
    expect(() => validarPromociones(repetido)).toThrow(/Código repetido: "BUENFIN10"/);
    const porcentaje = await leer(PROMOCIONES_PATH);
    porcentaje.promociones[0].porcentaje = 120;
    expect(() => validarPromociones(porcentaje)).toThrow(/promociones\.0\.porcentaje/);
  });

  it("un modo de combinación desconocido o una tasa de IVA de 16 falla", async () => {
    const modo = await leer(CONFIGURACION_PATH);
    modo.configuracion.promociones.modoCombinacion = "maximo";
    expect(() => validarConfiguracion(modo)).toThrow(/configuracion\.promociones\.modoCombinacion/);
    const tasa = await leer(CONFIGURACION_PATH);
    tasa.configuracion.iva.tasa = 16;
    expect(() => validarConfiguracion(tasa)).toThrow(/configuracion\.iva\.tasa/);
  });
});
