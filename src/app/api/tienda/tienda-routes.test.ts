import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Copias temporales del mock del panel antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/tienda-routes-${process.pid}`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.BANNERS_PATH = `${base}/banners.json`;
  process.env.SUCURSALES_PATH = `${base}/sucursales.json`;
  return {
    base,
    productosPath: process.env.PRODUCTOS_PATH,
    bannersPath: process.env.BANNERS_PATH,
    sucursalesPath: process.env.SUCURSALES_PATH,
  };
});

import type { Banner } from "@/lib/banners/schema";
import type { Producto, ProductosArchivo } from "@/lib/catalogo/schema";
import type { Sucursal, SucursalesArchivo } from "@/lib/sucursales/schema";
import { BANNERS_PATH, PRODUCTOS_PATH, SUCURSALES_PATH } from "@/server/mock-panel";
import { GET as getBanners } from "./banners/route";
import { GET as getProductos } from "./productos/route";
import { GET as getSucursales } from "./sucursales/route";

async function editarProductos(cambiar: (archivo: ProductosArchivo) => void) {
  const archivo = JSON.parse(await readFile(env.productosPath, "utf8"));
  cambiar(archivo);
  await writeFile(env.productosPath, JSON.stringify(archivo));
}

const productos = async (): Promise<{ status: number; body: { ejemplo: boolean; productos: Producto[] } }> => {
  const res = await getProductos();
  return { status: res.status, body: await res.json() };
};
const titulosBanners = async () => ((await (await getBanners()).json()).banners as Banner[]).map((b) => b.titulo);
const producto = (lista: Producto[], nombre: string) => lista.find((p) => p.nombre === nombre);
const skus = (p: Producto | undefined) => p?.variantes.map((v) => v.sku) ?? [];

beforeEach(async () => {
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, env.productosPath);
  await copyFile(BANNERS_PATH, env.bannersPath);
  await copyFile(SUCURSALES_PATH, env.sucursalesPath);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("GET /api/tienda/productos", () => {
  it("responde sin sesión, con montos en pesos y por orden", async () => {
    const { status, body } = await productos();
    expect(status).toBe(200);
    expect(body.ejemplo).toBe(true);
    expect(body.productos.map((p) => p.nombre)).toEqual(["Tarjeta", "Volante", "Lona 13 oz.", "Imán", "Adhesivo"]);
    expect(producto(body.productos, "Tarjeta")?.variantes[0]).toMatchObject({ sku: "70000177", precio: 115 });
  });

  it("la lona urgente (solo mostrador) no aparece; la de 720 y la de 1200 sí", async () => {
    const lona = producto((await productos()).body.productos, "Lona 13 oz.");
    expect(skus(lona)).toEqual(["70000178", "70000181"]);
  });

  it("una variante inactiva no aparece", async () => {
    await editarProductos((archivo) => {
      archivo.productos[0].variantes[0].activa = false;
    });
    expect(skus(producto((await productos()).body.productos, "Tarjeta"))).not.toContain("70000177");
  });

  it("un producto sin variantes en línea desaparece", async () => {
    await editarProductos((archivo) => {
      const adhesivo = archivo.productos.find((p) => p.nombre === "Adhesivo")!;
      adhesivo.variantes.forEach((v) => (v.canales = ["mostrador"]));
    });
    expect(producto((await productos()).body.productos, "Adhesivo")).toBeUndefined();
  });

  it("un producto inactivo y una especificación inactiva no aparecen", async () => {
    await editarProductos((archivo) => {
      archivo.productos.find((p) => p.nombre === "Imán")!.activo = false;
      archivo.productos[0].especificaciones[0].activa = false;
    });
    const lista = (await productos()).body.productos;
    expect(producto(lista, "Imán")).toBeUndefined();
    expect(producto(lista, "Tarjeta")?.especificaciones.map((e) => e.nombre)).toEqual(["Suaje", "Foliado"]);
  });

  it("una especificación limitada a variantes ocultas se quita de esas variantes", async () => {
    await editarProductos((archivo) => {
      archivo.productos[0].variantes[0].activa = false; // tarjeta couché
    });
    const suaje = producto((await productos()).body.productos, "Tarjeta")?.especificaciones.find(
      (e) => e.nombre === "Suaje",
    );
    expect(suaje?.variantes).not.toContain("6720a1f0c1a2b3c4d5e60211");
  });

  it("un mock inválido responde 500 CATALOGO_INVALIDO y deja el campo en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await editarProductos((archivo) => {
      (archivo.productos[0] as unknown as Record<string, unknown>).orden = "primero";
    });
    const res = await getProductos();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("CATALOGO_INVALIDO");
    expect(log).toHaveBeenCalledWith("[mock-panel]", expect.stringMatching(/productos\.0\.orden/));
    log.mockRestore();
  });
});

describe("GET /api/tienda/banners", () => {
  it("responde sin sesión con los vigentes por orden; el inactivo y el Buen Fin (futuro) no aparecen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T18:00:00Z"));
    expect(await titulosBanners()).toEqual([
      "Tarjetas de presentación desde $115 el millar",
      "Lonas a la medida desde $55 el m²",
    ]);
  });

  it("dentro de su vigencia, el Buen Fin aparece primero (orden 0)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T18:00:00Z"));
    expect((await titulosBanners())[0]).toBe("Buen Fin: 10% en tarjetas");
  });

  it("después de su vigencia, el Buen Fin ya no aparece", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T06:00:00Z"));
    expect(await titulosBanners()).not.toContain("Buen Fin: 10% en tarjetas");
  });
});

describe("GET /api/tienda/sucursales", () => {
  async function editarSucursales(cambiar: (archivo: SucursalesArchivo) => void) {
    const archivo = JSON.parse(await readFile(env.sucursalesPath, "utf8"));
    cambiar(archivo);
    await writeFile(env.sucursalesPath, JSON.stringify(archivo));
  }
  const nombres = async () => ((await (await getSucursales()).json()).sucursales as Sucursal[]).map((s) => s.nombre);

  it("responde sin sesión con las 3 activas, por clave", async () => {
    const res = await getSucursales();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ejemplo).toBe(true);
    expect(body.sucursales.map((s: Sucursal) => s.nombre)).toEqual(["KARSO Centro", "KARSO Cumbres", "KARSO San Nicolás"]);
    expect(body.sucursales[0]).toMatchObject({ horario: "Lunes a viernes 9:00–19:00, sábado 9:00–14:00" });
  });

  it("una sucursal inactiva no aparece y el orden sigue la clave, no el del archivo", async () => {
    await editarSucursales((archivo) => {
      archivo.sucursales[1].activa = false;
      archivo.sucursales.reverse();
    });
    expect(await nombres()).toEqual(["KARSO Centro", "KARSO San Nicolás"]);
  });

  it("un mock inválido responde 500 SUCURSALES_INVALIDAS y deja el campo en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await editarSucursales((archivo) => {
      archivo.sucursales[0].direccion.codigoPostal = "640";
    });
    const res = await getSucursales();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("SUCURSALES_INVALIDAS");
    expect(log).toHaveBeenCalledWith("[mock-panel]", expect.stringMatching(/sucursales\.0\.direccion\.codigoPostal/));
    log.mockRestore();
  });
});
