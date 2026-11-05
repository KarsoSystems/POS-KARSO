import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { BannersArchivo } from "../src/lib/banners/schema";
import type { ProductosArchivo, Variante } from "../src/lib/catalogo/schema";
import {
  BANNERS_ORIGINAL,
  BANNERS_PATH,
  DATA_DIR,
  PRODUCTOS_ORIGINAL,
  PRODUCTOS_PATH,
  UPLOADS_DIR,
} from "./rutas";

export const fixture = (nombre: string) => path.join(__dirname, "fixtures", nombre);

// Ids del mock del panel (config/mock-panel/productos.json).
export const ID = {
  tarjeta: "6720a1f0c1a2b3c4d5e60201",
  tarjetaCouche: "6720a1f0c1a2b3c4d5e60211",
  lona: "6720a1f0c1a2b3c4d5e60202",
  lona720: "6720a1f0c1a2b3c4d5e60221",
  volante: "6720a1f0c1a2b3c4d5e60203",
  iman: "6720a1f0c1a2b3c4d5e60204",
  suaje: 2,
  ojillos: 5,
};

interface LineaGuardada {
  lineaId: string;
  subtotal: number;
  precioBase: number;
  problema: string | null;
}

/** Contenido de orders.json del servidor de e2e. */
export async function leerOrders(): Promise<{
  version: number;
  ultimoFolio: number;
  pedidos: { id: string; folio: string | null; userId: string; estado: string; productos: LineaGuardada[]; total: number }[];
}> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, "orders.json"), "utf8"));
  } catch {
    return { version: 2, ultimoFolio: 0, pedidos: [] };
  }
}

export async function escribirOrders(data: unknown) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, "orders.json"), JSON.stringify(data, null, 2));
}

/** Archivos en uploads/ (sin temporales). */
export async function enUploads(): Promise<string[]> {
  const archivos = await readdir(UPLOADS_DIR).catch(() => [] as string[]);
  return archivos.filter((a) => !a.startsWith("."));
}

/** Edita la copia de productos que lee el servidor de e2e (la de git no se toca). */
export async function editarProductos(cambiar: (archivo: ProductosArchivo) => void) {
  const archivo = JSON.parse(await readFile(PRODUCTOS_PATH, "utf8"));
  cambiar(archivo);
  await writeFile(PRODUCTOS_PATH, JSON.stringify(archivo, null, 2));
}

/** La variante de la copia de productos, por producto y variante. */
export const varianteDe = (archivo: ProductosArchivo, productoId: string, varianteId: string): Variante =>
  archivo.productos.find((p) => p._id === productoId)!.variantes.find((v) => v.varianteId === varianteId)!;

/** Edita la copia de banners que lee el servidor de e2e. */
export async function editarBanners(cambiar: (archivo: BannersArchivo) => void) {
  const archivo = JSON.parse(await readFile(BANNERS_PATH, "utf8"));
  cambiar(archivo);
  await writeFile(BANNERS_PATH, JSON.stringify(archivo, null, 2));
}

/** Deja el mock del panel como el de git. */
export async function restaurarMock() {
  await copyFile(PRODUCTOS_ORIGINAL, PRODUCTOS_PATH);
  await copyFile(BANNERS_ORIGINAL, BANNERS_PATH);
}

/** Sube un fixture por la API (comparte cookies con la página) y devuelve el id. */
export async function subirPorApi(request: APIRequestContext, nombre: string): Promise<string> {
  const res = await request.post("/api/archivos", {
    multipart: { archivo: { name: nombre, mimeType: "application/octet-stream", buffer: await readFile(fixture(nombre)) } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).archivo.id;
}

/** Tarjeta couché × 2 millares con suaje: $310.00. */
export const tarjeta = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivoId,
  productoId: ID.tarjeta,
  varianteId: ID.tarjetaCouche,
  especificaciones: [ID.suaje],
  cantidad: 2,
  ...cambios,
});

/** Lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos: $414.00. */
export const lona = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivoId,
  productoId: ID.lona,
  varianteId: ID.lona720,
  medida: { ancho: 2, alto: 1.5 },
  especificaciones: [ID.ojillos],
  cantidad: 2,
  ...cambios,
});

export async function agregarPorApi(request: APIRequestContext, linea: Record<string, unknown>) {
  const res = await request.post("/api/pedidos/borrador/items", { data: linea });
  expect(res.status()).toBe(201);
  return (await res.json()).pedido as { productos: LineaGuardada[]; total: number };
}

/** Una opción de atributo o un producto del editor (botones role="radio"). */
export const opcion = (page: Page, nombre: string | RegExp) =>
  page.getByRole("radio", { name: nombre, exact: typeof nombre === "string" });

/** En el editor: sube el archivo y deja 2 millares de tarjeta couché con suaje. */
export async function llenarTarjeta(page: Page, archivo = "perro.png") {
  await page.getByLabel("Archivo").setInputFiles(fixture(archivo));
  await expect(page.getByText(new RegExp(`^${archivo.split(".").pop()!.toUpperCase()} ·`))).toBeVisible();
  await opcion(page, /^Tarjeta Tarjetas/).click();
  await opcion(page, "Couché").click();
  await page.getByLabel(/Suaje/).check();
  await page.getByLabel(/^Cantidad/).fill("2");
}

