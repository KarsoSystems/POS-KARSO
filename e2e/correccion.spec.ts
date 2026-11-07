import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { formatearDiaDe } from "../src/lib/pedidos/formato";
import { crearCuentaActiva, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  confirmarPorApi,
  escribirOrders,
  fixture,
  leerOrders,
  lona,
  pagarPorApi,
  restaurarMock,
  subirPorApi,
  tarjeta,
} from "./pedidos-helpers";

// Rechazo y corrección (SPEC 09): mostrador rechaza desde el simulador del panel
// (el servidor de e2e corre con DEMO_PANEL=1), el cliente sube los archivos
// corregidos y envía la corrección, o el plazo vence y el pedido se cancela. Las
// fechas dependen del día en que corre el test: se comparan con las que guardó el
// servidor.

test.afterEach(restaurarMock);

/** Tarjeta couché + lona 720 dpi, pagado: queda `enviado`. */
async function pedidoEnviado(request: APIRequestContext, codigo?: string) {
  await agregarPorApi(request, tarjeta(await subirPorApi(request, "tarjeta-cmyk.jpg")));
  await agregarPorApi(request, lona(await subirPorApi(request, "lona-cmyk.jpg")));
  if (codigo) expect((await request.post("/api/pedidos/borrador/promociones", { data: { codigo } })).status()).toBe(200);
  const pedido = await confirmarPorApi(request);
  expect((await pagarPorApi(request, pedido.id)).status()).toBe(200);
  return pedido;
}

/** Rechaza las líneas por la API del simulador. */
async function rechazarPorApi(request: APIRequestContext, id: string, lineas: { lineaId: string; motivo: string; comentario: string }[]) {
  const res = await request.post(`/api/demo-panel/pedidos/${id}/rechazar`, { data: { lineas } });
  expect(res.status()).toBe(200);
}

const guardado = async (id: string) => (await leerOrders()).pedidos.find((p) => p.id === id)!;
const fila = (page: Page, folio: string) => page.getByRole("listitem", { name: `Pedido ${folio}` });
const encabezado = (page: Page, folio: string) => page.getByRole("heading", { name: new RegExp(folio) });
/** La línea en el detalle del cliente (su nombre accesible empieza con el del producto). */
const lineaDetalle = (page: Page, producto: RegExp) => page.getByRole("listitem", { name: producto });

test.describe("Rechazo y corrección", () => {
  test("mostrador rechaza dos líneas; el cliente ve motivos y plazo, corrige las dos y envía; se revalida desde la corrección", async ({
    page,
    browser,
    baseURL,
  }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoEnviado(page.request);
    const [lineaTarjeta] = pedido.productos.map((l) => l.lineaId);

    // Mostrador, en otra ventana: rechaza con un motivo por línea.
    const mostrador = await browser.newContext({ baseURL });
    const panel = await mostrador.newPage();
    await panel.goto("/demo/panel");
    const suFila = fila(panel, pedido.folio);
    await suFila.getByRole("button", { name: "Rechazar" }).click();
    await suFila.getByLabel(/^Rechazar Tarjeta/).check();
    await suFila.getByLabel(/^Rechazar Lona/).check();
    await suFila.getByLabel(/^Motivo · Tarjeta/).selectOption("resolucion_insuficiente");
    await suFila.getByLabel(/^Comentario · Tarjeta/).fill("El frente está a 150 dpi, se requieren 300");
    await suFila.getByLabel(/^Motivo · Lona/).selectOption("color_rgb");
    await suFila.getByRole("button", { name: "Confirmar rechazo" }).click();
    await expect(suFila.getByText("Escribe un comentario para el cliente")).toBeVisible();
    await suFila.getByLabel(/^Comentario · Lona/).fill("Conviértelo a CMYK");
    await suFila.getByRole("button", { name: "Confirmar rechazo" }).click();
    await expect(suFila.getByText(/Esperando la corrección del cliente/)).toBeVisible();

    const rechazado = await guardado(pedido.id);
    expect(rechazado.estatus).toBe("rechazado");
    expect(rechazado.rechazos.map((r) => r.motivo)).toEqual(["resolucion_insuficiente", "color_rgb"]);
    const limite = formatearDiaDe(rechazado.rechazos[0].fechaLimiteCorreccion);
    const anterior = rechazado.productos[0].archivos.frente!.archivoId;

    // El cliente: Mis pedidos y el detalle con los motivos y el plazo.
    await page.goto("/panel/pedidos");
    await expect(page.getByRole("link", { name: new RegExp(pedido.folio) })).toContainText(`Corrige antes del ${limite}`);
    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(encabezado(page, pedido.folio)).toContainText("Rechazado");
    await expect(page.getByTestId("aviso-rechazo")).toContainText(`Corrige antes del ${limite}.`);
    const enviar = page.getByRole("button", { name: "Enviar corrección" });
    await expect(enviar).toBeDisabled();
    const tarjetaDetalle = lineaDetalle(page, /^Tarjeta:/);
    const lonaDetalle = lineaDetalle(page, /^Lona 13 oz\.:/);
    await expect(tarjetaDetalle).toContainText("Rechazada: Resolución insuficiente. El frente está a 150 dpi, se requieren 300");
    await expect(lonaDetalle).toContainText("Rechazada: El archivo está en RGB. Conviértelo a CMYK");

    // Corrige la tarjeta: queda marcada, el archivo anterior ya no existe y todavía falta la lona.
    await tarjetaDetalle.getByLabel("Subir archivo corregido del frente").setInputFiles(fixture("tarjeta-cmyk-600dpi.jpg"));
    await expect(page.getByTestId("linea-corregida")).toHaveCount(1);
    await expect(lineaDetalle(page, /^Tarjeta:/)).toContainText("Frente: tarjeta-cmyk-600dpi.jpg");
    await expect(enviar).toBeDisabled();
    const corregida = await guardado(pedido.id);
    expect(corregida.productos[0].archivos.frente!.archivoId).not.toBe(anterior);
    expect((await page.request.get(`/api/archivos/${anterior}`)).status()).toBe(404);
    expect(corregida.total).toBe(rechazado.total);

    await lonaDetalle.getByLabel("Subir archivo corregido del frente").setInputFiles(fixture("lona-cmyk.jpg"));
    await expect(page.getByTestId("linea-corregida")).toHaveCount(2);
    await enviar.click();
    await expect(encabezado(page, pedido.folio)).toContainText("Enviado");
    await expect(page.getByTestId("aviso-rechazo")).toHaveCount(0);
    const historial = page.getByLabel("Historial del pedido");
    await expect(historial.getByText("Rechazado", { exact: true })).toBeVisible();
    await expect(historial).toContainText("Archivos corregidos por el cliente");

    // Mostrador vuelve a validar: el conteo empieza en el envío de la corrección (KARSO 5.9).
    await panel.reload();
    await suFila.getByRole("button", { name: "Validar (recibido)" }).click();
    await expect(suFila.getByRole("button", { name: "Validar (recibido)" })).toHaveCount(0);
    const validado = await guardado(pedido.id);
    expect(validado.estatus).toBe("recibido");
    expect(validado.correccionEnviadaEn).not.toBeNull();
    expect(validado.fechaInicioConteo).toBe(validado.correccionEnviadaEn);
    // Ya validado, el pedido no acepta más correcciones.
    const tarde = await page.request.put(`/api/pedidos/${pedido.id}/lineas/${lineaTarjeta}/archivos`, {
      data: { frente: await subirPorApi(page.request, "tarjeta-cmyk.jpg") },
    });
    expect(tarde.status()).toBe(409);
    expect((await tarde.json()).error.code).toBe("ESTATUS_INVALIDO");
    await mostrador.close();
  });

  test("el simulador solo ofrece Rechazar en pedidos enviados", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    const pendiente = await confirmarPorApi(page.request); // sin pagar: pago_pendiente
    const enviado = await pedidoEnviado(page.request);
    const recibido = await pedidoEnviado(page.request);
    expect((await page.request.post(`/api/demo-panel/pedidos/${recibido.id}/validar`)).status()).toBe(200);

    await page.goto("/demo/panel");
    await expect(fila(page, enviado.folio).getByRole("button", { name: "Rechazar" })).toBeVisible();
    await expect(fila(page, pendiente.folio).getByRole("button", { name: "Rechazar" })).toHaveCount(0);
    await expect(fila(page, recibido.folio).getByRole("button", { name: "Rechazar" })).toHaveCount(0);
    const res = await page.request.post(`/api/demo-panel/pedidos/${recibido.id}/rechazar`, {
      data: { lineas: [{ lineaId: recibido.productos[0].lineaId, motivo: "otro", comentario: "Mancha" }] },
    });
    expect(res.status()).toBe(409);
  });
});

test.describe("Plazo vencido", () => {
  test("sin corregir a tiempo: cancelado con su motivo, el reembolso lo gestiona la sucursal y BIENVENIDA5 se libera", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoEnviado(page.request, "BIENVENIDA5");
    const lineaId = pedido.productos[0].lineaId;
    await rechazarPorApi(page.request, pedido.id, [{ lineaId, motivo: "medida_incorrecta", comentario: "Es de 9 x 5 cm" }]);

    // El plazo ya pasó (el servidor lo revisa al leer).
    const orders = await leerOrders();
    orders.pedidos.find((p) => p.id === pedido.id)!.rechazos[0].fechaLimiteCorreccion = new Date(Date.now() - 60_000).toISOString();
    await escribirOrders(orders);

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(encabezado(page, pedido.folio)).toContainText("Cancelado");
    await expect(page.getByText("No corrigió el archivo en el plazo").first()).toBeVisible();
    await expect(page.getByText("El reembolso lo gestiona la sucursal.")).toBeVisible();
    await expect(page.getByTestId("aviso-rechazo")).toHaveCount(0);
    expect((await guardado(pedido.id)).estatus).toBe("cancelado");

    const tarde = await page.request.put(`/api/pedidos/${pedido.id}/lineas/${lineaId}/archivos`, {
      data: { frente: await subirPorApi(page.request, "tarjeta-cmyk.jpg") },
    });
    expect(tarde.status()).toBe(409);
    expect((await tarde.json()).error.code).toBe("CORRECCION_VENCIDA");

    // El código de un uso por cliente vuelve a estar disponible en el borrador nuevo.
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    expect((await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "BIENVENIDA5" } })).status()).toBe(200);
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en el detalle rechazado (con un archivo corregido) y en el formulario de rechazo", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const pedido = await pedidoEnviado(page.request);

    await page.goto("/demo/panel");
    const suFila = fila(page, pedido.folio);
    await suFila.getByRole("button", { name: "Rechazar" }).click();
    await suFila.getByLabel(/^Rechazar Tarjeta/).check();
    await suFila.getByLabel(/^Rechazar Lona/).check();
    await sinScrollHorizontal(page);
    await suFila.getByLabel(/^Rechazar Lona/).uncheck();
    await suFila.getByLabel(/^Motivo · Tarjeta/).selectOption("fuera_area_segura");
    await suFila.getByLabel(/^Comentario · Tarjeta/).fill("El texto queda a 1 mm del corte");
    await suFila.getByRole("button", { name: "Confirmar rechazo" }).click();
    await expect(suFila.getByText(/Esperando la corrección del cliente/)).toBeVisible();

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await lineaDetalle(page, /^Tarjeta:/).getByLabel("Subir archivo corregido del frente").setInputFiles(fixture("tarjeta-cmyk-600dpi.jpg"));
    await expect(page.getByTestId("linea-corregida")).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
