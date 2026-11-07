import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { ConfiguracionArchivo } from "../src/lib/configuracion/schema";
import { crearCuentaActiva, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  confirmarPorApi,
  escribirOrders,
  leerOrders,
  moverVencimiento,
  opcion,
  pagarPorApi,
  restaurarMock,
  siguienteFolio,
  subirPorApi,
  tarjeta,
} from "./pedidos-helpers";
import { CONFIGURACION_PATH, UPLOADS_DIR } from "./rutas";

// Pago con Mercado Pago emulado (SPEC 07): folio KAR, página de pago (aprobar,
// rechazar o dejar pendiente), pago_pendiente → enviado y vencimiento al leer.

test.afterEach(restaurarMock);

const HORA = 60 * 60 * 1000;
const aviso = (page: Page) => page.getByRole("alert").first();
const pagarEnDetalle = (page: Page) => page.getByRole("link", { name: /^Pagar \$/ });

/** Cuenta nueva con una tarjeta couché ($310.00) y la sucursal elegida, lista para "Hacer pedido". */
async function borradorListo(request: APIRequestContext, codigo?: string) {
  await agregarPorApi(request, tarjeta(await subirPorApi(request, "tarjeta-cmyk.jpg")));
  if (codigo) await request.post("/api/pedidos/borrador/promociones", { data: { codigo } });
}

async function hacerPedidoEnPantalla(page: Page) {
  await page.goto("/panel/pedidos/nuevo");
  await opcion(page, /KARSO Centro/).click();
  await page.getByRole("button", { name: "Hacer pedido" }).click();
  await expect(page).toHaveURL(/\/panel\/pedidos\/[\w-]+\/pago$/);
  return page.url().match(/\/panel\/pedidos\/([\w-]+)\/pago$/)![1];
}

test.describe("Hacer pedido", () => {
  test("folio KAR consecutivo, pago_pendiente, historial y 24 h para pagar; la página de pago muestra folio, total y hora límite", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const folio = await siguienteFolio();
    const id = await hacerPedidoEnPantalla(page);

    await expect(page.getByText(folio)).toBeVisible();
    await expect(page.getByTestId("total-a-pagar")).toHaveText("$310.00");
    await expect(page.getByText("Paga antes del")).toBeVisible();
    await expect(page.getByText("Simulación: no se hace ningún cobro")).toBeVisible();

    const pedido = (await leerOrders()).pedidos.find((p) => p.id === id)!;
    expect(pedido).toMatchObject({ folio, estatus: "pago_pendiente", pagos: [], pagado: 0 });
    expect(Date.parse(pedido.vencimientoPago!) - Date.parse(pedido.confirmadoAt!)).toBe(24 * HORA);
    expect((pedido as unknown as { historialEstatus: unknown[] }).historialEstatus).toEqual([
      expect.objectContaining({ estatus: "pago_pendiente", por: "sistema" }),
    ]);

    // El siguiente pedido toma el folio que sigue.
    await borradorListo(page.request);
    const siguiente = await siguienteFolio();
    expect(Number(siguiente.slice(-6))).toBe(Number(folio.slice(-6)) + 1);
    expect((await confirmarPorApi(page.request)).folio).toBe(siguiente);

    // Los archivos se copian a la carpeta del folio KAR.
    const { lineaId } = pedido.productos[0];
    expect((await readdir(path.join(UPLOADS_DIR, "pedidos", folio))).sort()).toEqual([
      `${lineaId}_frente.jpg`,
      `${lineaId}_frente.jpg.miniatura.jpg`,
    ]);
  });

  test("con horasExpiracionPagoPendiente: 1 en el mock, el plazo del pedido nuevo es de 1 h", async ({ page }) => {
    const archivo: ConfiguracionArchivo = JSON.parse(await readFile(CONFIGURACION_PATH, "utf8"));
    archivo.configuracion.pedidos.horasExpiracionPagoPendiente = 1;
    await writeFile(CONFIGURACION_PATH, JSON.stringify(archivo, null, 2));

    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const pedido = await confirmarPorApi(page.request);
    expect(Date.parse(pedido.vencimientoPago!) - Date.parse(pedido.confirmadoAt!)).toBe(HORA);
  });
});

test.describe("Página de pago", () => {
  test("Rechazar → aviso y 'Pagar' para reintentar; Aprobar → Enviado con 2 pagos y solo el aprobado contado", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const id = await hacerPedidoEnPantalla(page);

    await page.getByRole("button", { name: "Rechazar" }).click();
    await expect(page).toHaveURL(/\?pago=rechazado$/);
    await expect(aviso(page)).toContainText("Tu pago fue rechazado");
    await expect(aviso(page)).toContainText("Puedes intentarlo de nuevo antes del");
    await expect(page.getByRole("heading", { name: /KAR-/ })).toContainText("Pago pendiente");
    await expect(page.getByText(/^Paga antes del/)).toBeVisible();

    await pagarEnDetalle(page).click();
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page).toHaveURL(/\?pago=aprobado$/);
    await expect(aviso(page)).toContainText("Pago aprobado");
    await expect(page.getByRole("heading", { name: /KAR-/ })).toContainText("Enviado");
    await expect(page.getByTestId("pago-aprobado")).toContainText(/Pagado el .+ · Ref\. \d{10}/);
    await expect(pagarEnDetalle(page)).toHaveCount(0);

    const pedido = (await leerOrders()).pedidos.find((p) => p.id === id)!;
    expect(pedido.pagos.map((p) => p.estatus)).toEqual(["rechazado", "aprobado"]);
    expect(pedido).toMatchObject({ estatus: "enviado", pagado: 310, saldo: 0 });
  });

  test("Dejarlo pendiente: sigue en pago_pendiente con un pago pendiente", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const id = await hacerPedidoEnPantalla(page);
    await page.getByRole("button", { name: "Dejarlo pendiente" }).click();
    await expect(aviso(page)).toContainText("Tu pago quedó pendiente");
    await expect(pagarEnDetalle(page)).toHaveText("Pagar $310.00");
    expect((await leerOrders()).pedidos.find((p) => p.id === id)!.pagos.map((p) => p.estatus)).toEqual(["pendiente"]);
  });

  test("un pedido enviado no muestra 'Pagar' y la API responde 409; el de otro usuario, 404", async ({
    page,
    playwright,
    baseURL,
  }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const pedido = await confirmarPorApi(page.request);
    expect((await pagarPorApi(page.request, pedido.id)).status()).toBe(200);

    const otraVez = await pagarPorApi(page.request, pedido.id);
    expect(otraVez.status()).toBe(409);
    expect((await otraVez.json()).error.code).toBe("ESTATUS_INVALIDO");
    await page.goto(`/panel/pedidos/${pedido.id}/pago`);
    await expect(page.getByText("Este pedido ya no espera su pago")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);

    const otro = await playwright.request.newContext({ baseURL });
    await crearCuentaActiva(otro);
    expect((await pagarPorApi(otro, pedido.id)).status()).toBe(404);
    await otro.dispose();
  });
});

test.describe("Vencimiento del pago", () => {
  test("vencido: Cancelado en Mis pedidos y en el detalle, con su motivo; pagarlo → 409 PAGO_VENCIDO", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const pedido = await confirmarPorApi(page.request);
    await moverVencimiento(pedido.id);

    await page.goto("/panel/pedidos");
    await expect(page.getByRole("link", { name: new RegExp(pedido.folio) })).toContainText("Cancelado");
    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("Cancelado");
    await expect(page.getByText("Pago no recibido en 24 h").first()).toBeVisible();
    await expect(pagarEnDetalle(page)).toHaveCount(0);

    const res = await pagarPorApi(page.request, pedido.id);
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("PAGO_VENCIDO");
    const guardado = (await leerOrders()).pedidos.find((p) => p.id === pedido.id) as unknown as Record<string, unknown>;
    expect(guardado).toMatchObject({ estatus: "cancelado", cancelacion: { por: "sistema", motivo: "Pago no recibido en 24 h" } });
  });

  test("si vence con la página de pago abierta, Aprobar lleva al detalle con 'El plazo para pagar venció'", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const id = await hacerPedidoEnPantalla(page);
    // Primero que la página termine de pedir el pedido al servidor (todavía a
    // tiempo; al montar vuelve a pedirlo aunque ya esté en la caché); luego vence.
    await expect(page.getByRole("button", { name: "Aprobar" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await moverVencimiento(id);
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page).toHaveURL(/\?pago=vencido$/);
    await expect(aviso(page)).toContainText("El plazo para pagar venció");
    await expect(page.getByRole("heading", { name: /KAR-/ })).toContainText("Cancelado");
  });

  test("un minuto antes de la hora límite todavía se puede pagar", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const pedido = await confirmarPorApi(page.request);
    await moverVencimiento(pedido.id, 60);
    expect((await pagarPorApi(page.request, pedido.id)).status()).toBe(200);
  });

  test("el vencimiento libera BIENVENIDA5 para otro pedido", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request, "BIENVENIDA5");
    const pedido = await confirmarPorApi(page.request);
    await borradorListo(page.request);
    expect((await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "BIENVENIDA5" } })).status()).toBe(422);

    await moverVencimiento(pedido.id);
    await page.request.get("/api/pedidos"); // leer cancela el vencido
    expect((await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "BIENVENIDA5" } })).status()).toBe(200);
  });
});

test.describe("Datos de versiones anteriores", () => {
  test("un orders.json de versión 4 se reemplaza por uno vacío sin romper la app", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const { contadores } = await leerOrders();
    await escribirOrders({ version: 4, ultimoFolio: 3, pedidos: [{ id: "viejo", folio: "P-000003", estado: "pedido", productos: [] }] });

    await page.goto("/panel/pedidos");
    await expect(page.getByText("Aún no tienes pedidos")).toBeVisible();
    expect(await leerOrders()).toMatchObject({ version: 6 });
    // Deja los contadores como estaban para que los folios de otros tests sigan la secuencia.
    await escribirOrders({ ...(await leerOrders()), contadores });
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en la página de pago ni en el detalle con 'Pagar'", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await borradorListo(page.request);
    const pedido = await confirmarPorApi(page.request);
    await page.goto(`/panel/pedidos/${pedido.id}/pago`);
    await expect(page.getByRole("button", { name: "Aprobar" })).toBeVisible();
    await sinScrollHorizontal(page);
    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(pagarEnDetalle(page)).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
