import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { CATALOGO_ORIGINAL, CATALOGO_PATH, DATA_DIR, UPLOADS_DIR } from "./rutas";

export const fixture = (nombre: string) => path.join(__dirname, "fixtures", nombre);

/** Contenido de orders.json del servidor de e2e. */
export async function leerOrders(): Promise<{
  ultimoFolio: number;
  pedidos: { id: string; folio: string | null; userId: string; estado: string; items: unknown[]; totales: Record<string, number> }[];
}> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, "orders.json"), "utf8"));
  } catch {
    return { ultimoFolio: 0, pedidos: [] };
  }
}

export async function escribirOrders(data: Awaited<ReturnType<typeof leerOrders>>) {
  await writeFile(path.join(DATA_DIR, "orders.json"), JSON.stringify(data, null, 2));
}

/** Archivos en uploads/ (sin temporales). */
export async function enUploads(): Promise<string[]> {
  const archivos = await readdir(UPLOADS_DIR).catch(() => [] as string[]);
  return archivos.filter((a) => !a.startsWith("."));
}

interface CatalogoEditable {
  papeles: { id: string; precioHojaCentavos: Record<string, number> }[];
  productos: { id: string; papelesIds: string[] }[];
  [clave: string]: unknown;
}

/** Edita la copia del catálogo que lee el servidor de e2e (el de git no se toca). */
export async function editarCatalogo(cambiar: (catalogo: CatalogoEditable) => void) {
  const catalogo = JSON.parse(await readFile(CATALOGO_PATH, "utf8"));
  cambiar(catalogo);
  await writeFile(CATALOGO_PATH, JSON.stringify(catalogo, null, 2));
}

export const restaurarCatalogo = () => copyFile(CATALOGO_ORIGINAL, CATALOGO_PATH);

/** Sube un fixture por la API (comparte cookies con la página) y devuelve el id. */
export async function subirPorApi(request: APIRequestContext, nombre: string): Promise<string> {
  const res = await request.post("/api/archivos", {
    multipart: { archivo: { name: nombre, mimeType: "application/octet-stream", buffer: await readFile(fixture(nombre)) } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).archivo.id;
}

export const volante = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivoId,
  productoId: "volante",
  tamano: { tipo: "predefinido", tamanoId: "media-carta" },
  papelId: "couche-150",
  hojaId: "tabloide",
  cantidad: 1000,
  ...cambios,
});

export async function agregarPorApi(request: APIRequestContext, item: Record<string, unknown>) {
  const res = await request.post("/api/pedidos/borrador/items", { data: item });
  expect(res.status()).toBe(201);
  return (await res.json()).pedido;
}

/** En el editor: sube el archivo y deja 1,000 volantes media carta couché 150 en tabloide. */
export async function llenarVolante(page: Page, archivo = "perro.png") {
  await page.getByLabel("Archivo").setInputFiles(fixture(archivo));
  await expect(page.getByText(new RegExp(`^${archivo.split(".").pop()!.toUpperCase()} ·`))).toBeVisible();
  await page.getByLabel("Producto").selectOption({ label: "Volante" });
  await page.getByLabel("Tamaño").selectOption({ label: "Media carta (14 × 21.6 cm)" });
  await page.getByLabel("Papel").selectOption({ label: "Couché 150 g" });
  await page.getByRole("radio", { name: /Tabloide/ }).check();
  await page.getByLabel("Cantidad de piezas").fill("1000");
}

