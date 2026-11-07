import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { formatearDia } from "../src/lib/pedidos/formato";
import { crearCuentaActiva, datosRegistro, PASSWORD, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  confirmarPorApi,
  escribirOrders,
  leerOrders,
  lona,
  pagarPorApi,
  restaurarMock,
  subirPorApi,
  tarjeta,
} from "./pedidos-helpers";

// Seguimiento (SPEC 08): estatus por línea, "disponible para recoger a partir
// del…", historial, QR y el simulador del panel (el servidor de e2e corre con
// DEMO_PANEL=1). Las fechas dependen del día en que corre el test: se comparan con
// las que guardó el servidor.

test.afterEach(restaurarMock);

/** Tarjeta couché (5 días) + lona 720 dpi (2 días): el pedido de ejemplo de KARSO. */
async function pedidoDeEjemplo(request: APIRequestContext, { pagar = true } = {}) {
  await agregarPorApi(request, tarjeta(await subirPorApi(request, "tarjeta-cmyk.jpg")));
  await agregarPorApi(request, lona(await subirPorApi(request, "lona-cmyk.jpg")));
  const pedido = await confirmarPorApi(request);
  if (pagar) expect((await pagarPorApi(request, pedido.id)).status()).toBe(200);
  return pedido;
}

const fila = (page: Page, folio: string) => page.getByRole("listitem", { name: `Pedido ${folio}` });
const guardado = async (id: string) =>
  (await leerOrders()).pedidos.find((p) => p.id === id)! as unknown as {
    estatus: string;
    fechaEntregaEstimada: string;
    productos: { lineaId: string; estatus: string; fechaEntregaEstimada: string }[];
    historialEstatus: { estatus: string; por: string }[];
  };

test.describe("Antes de validar", () => {
  test("pago pendiente: días hábiles en lugar de fecha, y el QR con el enlace de seguimiento", async ({ page, baseURL }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoDeEjemplo(page.request, { pagar: false });
    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByTestId("disponible-pedido")).toHaveText(
      "Estará listo 5 días hábiles después de que validemos tus archivos.",
    );
    const qr = page.getByTestId("qr-seguimiento");
    await expect(qr.getByRole("img", { name: `Código QR del pedido ${pedido.folio}` })).toBeVisible();
    await expect(qr).toHaveAttribute("data-enlace", `${baseURL}/panel/seguimiento/${pedido.folio}`);
    await expect(page.getByText("Muéstralo al recoger")).toHaveCount(0);
  });
});

test.describe("Simulador del panel y seguimiento", () => {
  test("validar → recibido con fechas; líneas en proceso y listas; entregar; el cliente ve cada paso y el historial", async ({
    page,
    browser,
    baseURL,
  }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoDeEjemplo(page.request);
    const [lineaTarjeta, lineaLona] = pedido.productos.map((l) => l.lineaId);

    // El simulador no usa la sesión del cliente: otra ventana, como mostrador.
    const mostrador = await browser.newContext({ baseURL });
    const panel = await mostrador.newPage();
    await panel.goto("/demo/panel");
    await expect(panel.getByText("Solo para el demo")).toBeVisible();
    const suFila = fila(panel, pedido.folio);
    await expect(suFila).toContainText("Enviado");
    await suFila.getByRole("button", { name: "Validar (recibido)" }).click();
    await expect(suFila.getByRole("button", { name: "Validar (recibido)" })).toHaveCount(0);

    const validado = await guardado(pedido.id);
    expect(validado.estatus).toBe("recibido");
    expect(validado.historialEstatus.at(-1)).toMatchObject({ estatus: "recibido", por: "panel-demo" });
    // La lona (2 días) queda antes que la tarjeta (5 días); el pedido, el día de la tarjeta.
    const [tarjetaLista, lonaLista] = validado.productos.map((l) => l.fechaEntregaEstimada);
    expect(lonaLista < tarjetaLista).toBe(true);
    expect(validado.fechaEntregaEstimada).toBe(tarjetaLista);
    expect((await mostrador.request.post(`/api/demo-panel/pedidos/${pedido.id}/validar`)).status()).toBe(409);

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("Recibido");
    await expect(page.getByTestId("disponible-pedido")).toHaveText(
      `Disponible para recoger a partir del ${formatearDia(tarjetaLista)}`,
    );
    await expect(page.getByTestId("disponible-linea")).toHaveText([
      `Lista a partir del ${formatearDia(tarjetaLista)}`,
      `Lista a partir del ${formatearDia(lonaLista)}`,
    ]);

    // Producción: la lona en proceso → el pedido en proceso.
    await suFila.getByRole("listitem").filter({ hasText: "Lona" }).getByRole("button", { name: "En proceso" }).click();
    await expect(suFila).toContainText("En proceso");
    await page.reload();
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("En proceso");
    expect((await mostrador.request.post(`/api/demo-panel/pedidos/${pedido.id}/lineas/${lineaLona}`, { data: { estatus: "en_proceso" } })).status()).toBe(409);

    // Todo listo → el pedido listo y el QR grande.
    for (const nombre of ["Lona", "Tarjeta"]) {
      await suFila.getByRole("listitem").filter({ hasText: nombre }).getByRole("button", { name: "Listo" }).click();
    }
    await expect(suFila.getByRole("button", { name: "Entregar" })).toBeEnabled();
    expect((await guardado(pedido.id)).estatus).toBe("listo");
    await page.reload();
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("Listo");
    await expect(page.getByText("Muéstralo al recoger")).toBeVisible();

    // Mostrador lo entrega (lo cierra).
    await suFila.getByRole("button", { name: "Entregar" }).click();
    await expect(suFila).toContainText("Entregado");
    await page.reload();
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("Entregado");
    await expect(page.getByTestId("disponible-pedido")).toHaveCount(0);
    const historial = page.getByLabel("Historial del pedido");
    for (const etiqueta of ["Pago pendiente", "Enviado", "Recibido", "En proceso", "Listo", "Entregado"]) {
      await expect(historial.getByText(etiqueta, { exact: true })).toBeVisible();
    }
    await expect(historial).toContainText("Pago aprobado por Mercado Pago");
    await expect(historial).toContainText("Archivos y datos validados");
    expect((await mostrador.request.post(`/api/demo-panel/pedidos/${pedido.id}/lineas/${lineaTarjeta}`, { data: { estatus: "listo" } })).status()).toBe(409);
    await mostrador.close();
  });

  test("un pedido sin pagar no se puede validar desde el simulador", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoDeEjemplo(page.request, { pagar: false });
    await page.goto("/demo/panel");
    await expect(fila(page, pedido.folio)).toContainText("Esperando el pago del cliente");
    await expect(fila(page, pedido.folio).getByRole("button", { name: "Validar (recibido)" })).toHaveCount(0);
    expect((await page.request.post(`/api/demo-panel/pedidos/${pedido.id}/validar`)).status()).toBe(409);
  });
});

test.describe("Página de seguimiento (QR)", () => {
  test("el dueño llega a su pedido; otra cuenta ve 'Pedido no encontrado'", async ({ page, baseURL, browser }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoDeEjemplo(page.request, { pagar: false });
    await page.goto(`/panel/seguimiento/${pedido.folio}`);
    await expect(page).toHaveURL(new RegExp(`/panel/pedidos/${pedido.id}$`));
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toBeVisible();

    const otra = await browser.newContext({ baseURL });
    await crearCuentaActiva(otra.request);
    const otraPagina = await otra.newPage();
    await otraPagina.goto(`/panel/seguimiento/${pedido.folio}`);
    await expect(otraPagina.getByText("Pedido no encontrado")).toBeVisible();
    await otra.close();
  });

  test("sin sesión: /login?siguiente=…, y al iniciar sesión llega directo a su pedido; un siguiente externo se ignora", async ({
    page,
    browser,
    baseURL,
  }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    const pedido = await pedidoDeEjemplo(page.request, { pagar: false });

    const sinSesion = await browser.newContext({ baseURL });
    const visitante = await sinSesion.newPage();
    await visitante.goto(`/panel/seguimiento/${pedido.folio}`);
    await expect(visitante).toHaveURL(`${baseURL}/login?siguiente=${encodeURIComponent(`/panel/seguimiento/${pedido.folio}`)}`);
    await expect(visitante.getByRole("link", { name: "Regístrate" })).toHaveAttribute(
      "href",
      `/registro?siguiente=${encodeURIComponent(`/panel/seguimiento/${pedido.folio}`)}`,
    );
    await visitante.waitForLoadState("networkidle");
    await visitante.getByLabel("Correo").fill(datos.correo);
    await visitante.getByLabel("Contraseña").fill(PASSWORD);
    await visitante.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(visitante).toHaveURL(new RegExp(`/panel/pedidos/${pedido.id}$`));
    await sinSesion.close();

    const otro = await browser.newContext({ baseURL });
    const externo = await otro.newPage();
    await externo.goto(`/login?siguiente=${encodeURIComponent("//otro.sitio/robar")}`);
    await externo.waitForLoadState("networkidle");
    await externo.getByLabel("Correo").fill(datos.correo);
    await externo.getByLabel("Contraseña").fill(PASSWORD);
    await externo.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(externo).toHaveURL(`${baseURL}/panel`);
    await otro.close();
  });
});

test.describe("Datos de versiones anteriores", () => {
  test("un orders.json de versión 5 se reemplaza por uno vacío sin romper la app", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const { contadores } = await leerOrders();
    await escribirOrders({ version: 5, contadores, pedidos: [{ id: "viejo", folio: "KAR-2026-000099", estatus: "enviado", productos: [] }] });
    await page.goto("/panel/pedidos");
    await expect(page.getByText("Aún no tienes pedidos")).toBeVisible();
    expect(await leerOrders()).toMatchObject({ version: 6 });
    await escribirOrders({ ...(await leerOrders()), contadores });
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en el detalle con historial y QR, en el seguimiento y en el simulador", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoDeEjemplo(page.request);
    expect((await page.request.post(`/api/demo-panel/pedidos/${pedido.id}/validar`)).status()).toBe(200);

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByLabel("Historial del pedido")).toBeVisible();
    await expect(page.getByTestId("qr-seguimiento").getByRole("img")).toBeVisible();
    await sinScrollHorizontal(page);

    await page.goto(`/panel/seguimiento/${pedido.folio}`);
    await expect(page).toHaveURL(new RegExp(`/panel/pedidos/${pedido.id}$`));
    await sinScrollHorizontal(page);

    await page.goto("/demo/panel");
    await expect(fila(page, pedido.folio)).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
