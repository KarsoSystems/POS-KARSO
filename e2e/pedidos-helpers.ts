import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { BannersArchivo } from "../src/lib/banners/schema";
import { ZONA_HORARIA_TIENDA } from "../src/lib/configuracion/schema";
import { anioEn, formatFolio } from "../src/lib/pedidos/pago";
import type { ProductosArchivo, Variante } from "../src/lib/catalogo/schema";
import {
  BANNERS_ORIGINAL,
  BANNERS_PATH,
  CONFIGURACION_ORIGINAL,
  CONFIGURACION_PATH,
  DATA_DIR,
  PRODUCTOS_ORIGINAL,
  PRODUCTOS_PATH,
  PROMOCIONES_ORIGINAL,
  PROMOCIONES_PATH,
  SUCURSALES_ORIGINAL,
  SUCURSALES_PATH,
  UPLOADS_DIR,
} from "./rutas";

export const fixture = (nombre: string) => path.join(__dirname, "fixtures", nombre);

// Ids del mock del panel (config/mock-panel/productos.json).
export const ID = {
  tarjeta: "6720a1f0c1a2b3c4d5e60201",
  tarjetaCouche: "6720a1f0c1a2b3c4d5e60211",
  tarjetaLaminada: "6720a1f0c1a2b3c4d5e60212", // reverso obligatorio
  centro: "6720a1f0c1a2b3c4d5e60100", // sucursales del mock del panel
  cumbres: "6720a1f0c1a2b3c4d5e60101",
  volanteBond: "6720a1f0c1a2b3c4d5e60233", // reverso no_aplica
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

export interface PedidoGuardado {
  id: string;
  folio: string | null;
  userId: string;
  estatus: string;
  productos: LineaGuardada[];
  total: number;
  confirmadoAt: string | null;
  vencimientoPago: string | null;
  pagos: { estatus: string; monto: number; referencia: string }[];
  pagado: number;
  saldo: number;
}

/** Contenido de orders.json del servidor de e2e (versión 5: `contadores` por año, como KARSO 6.10). */
export async function leerOrders(): Promise<{
  version: number;
  contadores: Record<string, number>;
  pedidos: PedidoGuardado[];
}> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, "orders.json"), "utf8"));
  } catch {
    return { version: 5, contadores: {}, pedidos: [] };
  }
}

/** El folio que recibirá el siguiente pedido: "KAR-2026-000007". */
export async function siguienteFolio(): Promise<string> {
  const anio = anioEn(new Date(), ZONA_HORARIA_TIENDA);
  const { contadores } = await leerOrders();
  return formatFolio(anio, (contadores[`pedidos-${anio}`] ?? 0) + 1);
}

/**
 * Hace que el plazo para pagar de un pedido ya haya pasado: mueve hacia atrás la
 * confirmación y la hora límite (conserva el plazo de 24 h del motivo).
 * `segundosRestantes` > 0 deja el plazo a punto de vencer, sin vencer todavía.
 */
export async function moverVencimiento(pedidoId: string, segundosRestantes = -60) {
  const orders = await leerOrders();
  const pedido = orders.pedidos.find((p) => p.id === pedidoId)!;
  const plazo = Date.parse(pedido.vencimientoPago!) - Date.parse(pedido.confirmadoAt!);
  const limite = Date.now() + segundosRestantes * 1000;
  pedido.vencimientoPago = new Date(limite).toISOString();
  pedido.confirmadoAt = new Date(limite - plazo).toISOString();
  await escribirOrders(orders);
}

/** Lo que respondería Mercado Pago, por la API de la página de pago simulada. */
export async function pagarPorApi(request: APIRequestContext, pedidoId: string, resultado = "aprobado") {
  return request.post(`/api/pedidos/${pedidoId}/pago-simulado`, { data: { resultado } });
}

export async function escribirOrders(data: unknown) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, "orders.json"), JSON.stringify(data, null, 2));
}

/** Archivos bajo uploads/<carpeta> ("temporal" o "pedidos/KAR-2026-000001"), sin los temporales de escritura. */
export async function enUploads(carpeta = "temporal"): Promise<string[]> {
  const archivos = await readdir(path.join(UPLOADS_DIR, carpeta)).catch(() => [] as string[]);
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
  await copyFile(SUCURSALES_ORIGINAL, SUCURSALES_PATH);
  await copyFile(PROMOCIONES_ORIGINAL, PROMOCIONES_PATH);
  await copyFile(CONFIGURACION_ORIGINAL, CONFIGURACION_PATH);
}

/**
 * Sube un fixture por la API con los tres pasos de la SPEC 05 (URL firmada, PUT y
 * confirmar; comparte cookies con la página) y devuelve el id.
 */
export async function subirPorApi(request: APIRequestContext, nombre: string): Promise<string> {
  const buffer = await readFile(fixture(nombre));
  const pedida = await request.post("/api/archivos/subidas", { data: { nombre, bytes: buffer.byteLength } });
  expect(pedida.status()).toBe(201);
  const { archivo, subida } = await pedida.json();
  expect((await request.put(subida.url, { data: buffer })).status()).toBe(200);
  const confirmada = await request.post(`/api/archivos/${archivo.id}/confirmar`);
  expect(confirmada.status()).toBe(200);
  return archivo.id;
}

/** `archivos` de la línea: solo frente, o frente y reverso. */
export const caras = (frente: string, reverso: unknown = null) => ({ frente, reverso });

/** Tarjeta couché × 2 millares con suaje: $310.00. */
export const tarjeta = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivos: caras(archivoId),
  productoId: ID.tarjeta,
  varianteId: ID.tarjetaCouche,
  especificaciones: [ID.suaje],
  cantidad: 2,
  ...cambios,
});

/** Lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos: $414.00. */
export const lona = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivos: caras(archivoId),
  productoId: ID.lona,
  varianteId: ID.lona720,
  medida: { ancho: 2, alto: 1.5 },
  especificaciones: [ID.ojillos],
  cantidad: 2,
  ...cambios,
});

/** Cambios del checkout del borrador por la API (sucursal, factura, datos fiscales). */
export async function checkoutPorApi(request: APIRequestContext, cambios: Record<string, unknown>) {
  const res = await request.patch("/api/pedidos/borrador", { data: cambios });
  expect(res.status()).toBe(200);
  return (await res.json()).pedido;
}

/** "Hacer pedido" por la API con la sucursal elegida (obligatoria desde la SPEC 06). */
export async function confirmarPorApi(request: APIRequestContext, sucursalEntregaId = ID.centro) {
  await checkoutPorApi(request, { sucursalEntregaId });
  const res = await request.post("/api/pedidos/borrador/confirmar");
  expect(res.status()).toBe(201);
  return (await res.json()).pedido as PedidoGuardado & { folio: string };
}

export async function agregarPorApi(request: APIRequestContext, linea: Record<string, unknown>) {
  const res = await request.post("/api/pedidos/borrador/items", { data: linea });
  expect(res.status()).toBe(201);
  return (await res.json()).pedido as { productos: LineaGuardada[]; total: number };
}

/** Una opción de atributo o un producto del editor (botones role="radio"). */
export const opcion = (page: Page, nombre: string | RegExp) =>
  page.getByRole("radio", { name: nombre, exact: typeof nombre === "string" });

/** En el editor: sube un fixture a la cara y espera a que aparezcan sus datos ("JPG · …"). */
export async function subirEnEditor(page: Page, cara: "frente" | "reverso", archivo: string) {
  await page.getByLabel(`Archivo del ${cara}`).setInputFiles(fixture(archivo));
  const formato = archivo.split(".").pop()!.toUpperCase();
  await expect(page.getByText(new RegExp(`^${formato} ·`)).first()).toBeVisible();
  await expect(page.getByText(archivo, { exact: true }).first()).toBeVisible();
}

/** En el editor: deja 2 millares de tarjeta couché con suaje y sube el frente. */
export async function llenarTarjeta(page: Page, archivo = "tarjeta-cmyk.jpg") {
  await opcion(page, /^Tarjeta Tarjetas/).click();
  await opcion(page, "Couché").click();
  await subirEnEditor(page, "frente", archivo);
  await page.getByLabel(/Suaje/).check();
  await page.getByLabel(/^Cantidad/).fill("2");
}

