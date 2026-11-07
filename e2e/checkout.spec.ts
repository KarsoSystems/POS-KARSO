import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { ConfiguracionArchivo } from "../src/lib/configuracion/schema";
import type { PromocionesArchivo } from "../src/lib/promociones/schema";
import type { SucursalesArchivo } from "../src/lib/sucursales/schema";
import { crearCuentaActiva, datosRegistro, PASSWORD, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  checkoutPorApi,
  confirmarPorApi,
  escribirOrders,
  ID,
  leerOrders,
  lona,
  moverVencimiento,
  opcion,
  restaurarMock,
  subirPorApi,
  tarjeta,
} from "./pedidos-helpers";
import { CONFIGURACION_PATH, DATA_DIR, PROMOCIONES_PATH, SUCURSALES_PATH } from "./rutas";

// Checkout del borrador (SPEC 06): sucursal de entrega, factura con IVA y códigos
// de promoción, con los totales de KARSO 5.4.

test.afterEach(restaurarMock);

const DATOS = {
  rfc: "PELJ800101ABC",
  razonSocial: "JUAN PEREZ LOPEZ",
  regimenFiscal: "612",
  codigoPostal: "64000",
  usoCfdi: "G03",
  correoFactura: "facturas@elaguila.com",
};

async function editar<T>(ruta: string, cambiar: (archivo: T) => void) {
  const archivo = JSON.parse(await readFile(ruta, "utf8")) as T;
  cambiar(archivo);
  await writeFile(ruta, JSON.stringify(archivo, null, 2));
}
const editarPromociones = (cambiar: (a: PromocionesArchivo) => void) => editar(PROMOCIONES_PATH, cambiar);
const promo = (a: PromocionesArchivo, codigo: string) => a.promociones.find((p) => p.codigo === codigo)!;

const hacerPedido = (page: Page) => page.getByRole("button", { name: "Hacer pedido" });
const faltan = (page: Page) => page.getByLabel("Falta para hacer el pedido");
const campoCodigo = (page: Page) => page.getByLabel("Código de promoción");
const formularioFiscal = (page: Page) => page.getByRole("form", { name: "Datos fiscales" });

/** Cuenta nueva con una tarjeta couché × 2 millares con suaje ($310.00) en el borrador. */
async function borradorConTarjeta(request: APIRequestContext, datos = datosRegistro()) {
  await crearCuentaActiva(request, datos);
  await agregarPorApi(request, tarjeta(await subirPorApi(request, "tarjeta-cmyk.jpg")));
  return datos;
}

async function aplicar(page: Page, codigo: string) {
  await campoCodigo(page).fill(codigo);
  await campoCodigo(page).press("Enter");
}

async function llenarDatosFiscales(page: Page, datos: Record<string, string>) {
  const f = formularioFiscal(page);
  await f.getByLabel("RFC").fill(datos.rfc);
  await f.getByLabel("Código postal").fill(datos.codigoPostal);
  await f.getByLabel("Razón social").fill(datos.razonSocial);
  await f.getByLabel("Régimen fiscal").selectOption(datos.regimenFiscal);
  await f.getByLabel("Uso del CFDI").selectOption(datos.usoCfdi);
  await f.getByLabel("Correo para la factura").fill(datos.correoFactura);
}

test.describe("Sucursal de entrega", () => {
  test("/api/tienda/sucursales: las 3 activas sin sesión, por clave; una inactiva no aparece; un mock inválido → 500", async ({
    request,
  }) => {
    const nombres = async () =>
      (await (await request.get("/api/tienda/sucursales")).json()).sucursales.map((s: { nombre: string }) => s.nombre);
    expect(await nombres()).toEqual(["KARSO Centro", "KARSO Cumbres", "KARSO San Nicolás"]);

    await editar<SucursalesArchivo>(SUCURSALES_PATH, (a) => {
      a.sucursales[1].activa = false;
    });
    expect(await nombres()).toEqual(["KARSO Centro", "KARSO San Nicolás"]);

    await editar<SucursalesArchivo>(SUCURSALES_PATH, (a) => {
      a.sucursales[0].telefono = "123";
    });
    const invalido = await request.get("/api/tienda/sucursales");
    expect(invalido.status()).toBe(500);
    expect((await invalido.json()).error.code).toBe("SUCURSALES_INVALIDAS");
  });

  test("obligatoria para hacer el pedido; se conserva al recargar y en otro dispositivo", async ({ page, browser, baseURL }) => {
    const datos = await borradorConTarjeta(page.request);
    await page.goto("/panel/pedidos/nuevo");
    await expect(hacerPedido(page)).toBeDisabled();
    await expect(faltan(page)).toHaveText("Elige la sucursal de entrega");
    const sinSucursal = await page.request.post("/api/pedidos/borrador/confirmar");
    expect(sinSucursal.status()).toBe(422);
    expect((await sinSucursal.json()).error).toMatchObject({
      code: "CHECKOUT_INCOMPLETO",
      fields: { sucursalEntregaId: "Elige la sucursal de entrega" },
    });

    await opcion(page, /KARSO Cumbres/).click();
    await expect(opcion(page, /KARSO Cumbres/)).toHaveAttribute("aria-checked", "true");
    await expect(hacerPedido(page)).toBeEnabled();
    await page.reload();
    await expect(opcion(page, /KARSO Cumbres/)).toHaveAttribute("aria-checked", "true");

    // Otro dispositivo: otra sesión del mismo cliente.
    const otro = await browser.newContext({ baseURL });
    const login = await otro.request.post("/api/auth/login", { data: { correo: datos.correo, password: PASSWORD } });
    expect(login.status()).toBe(200);
    const otraPagina = await otro.newPage();
    await otraPagina.goto("/panel/pedidos/nuevo");
    await expect(opcion(otraPagina, /KARSO Cumbres/)).toHaveAttribute("aria-checked", "true");
    await otro.close();
  });

  test("si la sucursal elegida se desactiva en el mock, el borrador la quita y avisa; el detalle muestra la elegida", async ({
    page,
  }) => {
    await borradorConTarjeta(page.request);
    await checkoutPorApi(page.request, { sucursalEntregaId: ID.cumbres });
    await editar<SucursalesArchivo>(SUCURSALES_PATH, (a) => {
      a.sucursales[1].activa = false;
    });
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("La sucursal KARSO Cumbres ya no está disponible; elige otra")).toBeVisible();
    await expect(opcion(page, /KARSO Centro/)).toHaveAttribute("aria-checked", "false");
    await expect(hacerPedido(page)).toBeDisabled();

    await opcion(page, /KARSO Centro/).click();
    await expect(page.getByText(/ya no está disponible/)).toHaveCount(0);
    await hacerPedido(page).click();
    await page.getByRole("link", { name: "Volver al pedido" }).click();
    await expect(page.getByRole("heading", { name: /Pedido KAR-/ })).toBeVisible();
    await expect(page.getByText("KARSO Centro")).toBeVisible();
    await expect(page.getByText("Calle Morelos 456, Centro, Monterrey, Nuevo León, C.P. 64000")).toBeVisible();
    await expect(page.getByText("Tel. 8180001111")).toBeVisible();
  });
});

test.describe("Factura", () => {
  test("IVA de 16 %, datos obligatorios, validación por campo y la leyenda sin IVA al quitarla", async ({ page }) => {
    await borradorConTarjeta(page.request);
    await checkoutPorApi(page.request, { sucursalEntregaId: ID.centro });
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Precios sin IVA. Si requieres factura, se suma al pagar.")).toBeVisible();

    await page.getByLabel("Requiero factura").check();
    await expect(page.getByText("IVA (16 %)")).toBeVisible();
    await expect(page.getByTestId("total-pedido")).toHaveText("$359.60");
    await expect(page.getByText("Precios sin IVA. Si requieres factura, se suma al pagar.")).toHaveCount(0);
    await expect(hacerPedido(page)).toBeDisabled();
    await expect(faltan(page)).toHaveText("Captura tus datos fiscales");

    await llenarDatosFiscales(page, { ...DATOS, rfc: "EAG950315K2", codigoPostal: "6400", correoFactura: "facturas@" });
    await formularioFiscal(page).getByRole("button", { name: "Guardar datos fiscales" }).click();
    for (const mensaje of ["RFC inválido", "El código postal debe tener 5 dígitos", "Correo inválido"]) {
      await expect(formularioFiscal(page).getByText(mensaje)).toBeVisible();
    }
    await llenarDatosFiscales(page, { ...DATOS, rfc: "EAG950315K21" });
    await formularioFiscal(page).getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(formularioFiscal(page).getByText("El régimen 612 no aplica a personas morales")).toBeVisible();

    // La API valida igual aunque no pase por el formulario.
    const api = await page.request.patch("/api/pedidos/borrador", { data: { datosFiscales: { ...DATOS, codigoPostal: "6400" } } });
    expect(api.status()).toBe(422);
    expect((await api.json()).error.fields).toEqual({ "datosFiscales.codigoPostal": "El código postal debe tener 5 dígitos" });

    await llenarDatosFiscales(page, DATOS);
    await formularioFiscal(page).getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(formularioFiscal(page).getByText("Datos guardados")).toBeVisible();
    await expect(hacerPedido(page)).toBeEnabled();

    await page.getByLabel("Requiero factura").uncheck();
    await expect(page.getByText("IVA (16 %)")).toHaveCount(0);
    await expect(page.getByText("Precios sin IVA. Si requieres factura, se suma al pagar.")).toBeVisible();
    await expect(page.getByTestId("total-pedido")).toHaveText("$310.00");
  });

  test("'Guardar en mi perfil' precarga los datos en el siguiente pedido; desmarcada, el perfil no cambia", async ({ page }) => {
    await borradorConTarjeta(page.request);
    await page.goto("/panel/pedidos/nuevo");
    await page.getByLabel("Requiero factura").check();
    await llenarDatosFiscales(page, DATOS);
    await expect(formularioFiscal(page).getByLabel("Guardar en mi perfil")).toBeChecked();
    await formularioFiscal(page).getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(formularioFiscal(page).getByText("Datos guardados")).toBeVisible();
    await confirmarPorApi(page.request);

    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    await page.goto("/panel/pedidos/nuevo");
    await page.getByLabel("Requiero factura").check();
    await expect(formularioFiscal(page).getByLabel("RFC")).toHaveValue("PELJ800101ABC");
    await expect(formularioFiscal(page).getByLabel("Razón social")).toHaveValue("JUAN PEREZ LOPEZ");

    // Un cambio solo para este pedido no toca el perfil.
    await formularioFiscal(page).getByLabel("Uso del CFDI").selectOption("G01");
    await formularioFiscal(page).getByLabel("Guardar en mi perfil").uncheck();
    await formularioFiscal(page).getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(formularioFiscal(page).getByText("Datos guardados")).toBeVisible();
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(me.user.datosFiscales).toMatchObject({ usoCfdi: "G03" });
  });
});

test.describe("Códigos de promoción", () => {
  test("KARSO10 en minúsculas: −$31.00 y total $279.00; inválidos, repetido y tercer código con su mensaje", async ({
    page,
  }) => {
    await borradorConTarjeta(page.request);
    await page.goto("/panel/pedidos/nuevo");
    await aplicar(page, "karso10");
    await expect(page.getByLabel("Códigos aplicados")).toContainText("KARSO10 (10 %)−$31.00");
    await expect(page.getByTestId("total-pedido")).toHaveText("$279.00");
    await expect(campoCodigo(page)).toHaveValue("");

    for (const [codigo, mensaje] of [
      ["BUENFIN10", "Este código aún no está vigente"],
      ["VERANO15", "Este código venció"],
      ["SUCURSAL20", "Este código solo es válido en sucursal"],
      ["PAUSA30", "Este código no es válido"],
      ["NOEXISTE", "Este código no es válido"],
      ["KARSO10", "Ya aplicaste este código"],
    ]) {
      await aplicar(page, codigo);
      await expect(page.getByRole("alert").filter({ hasText: mensaje })).toBeVisible();
      await expect(campoCodigo(page)).toHaveValue(codigo);
    }

    // KARSO10 + MAYOREO25 = 35 %: el segundo solo llega al tope de 30 % ($93.00 en total).
    await aplicar(page, "MAYOREO25");
    await expect(page.getByLabel("Códigos aplicados")).toContainText("MAYOREO25 (25 %)−$62.00");
    await expect(page.getByTestId("total-pedido")).toHaveText("$217.00");
    await aplicar(page, "BIENVENIDA5");
    await expect(page.getByText("Solo se aceptan 2 códigos por pedido")).toBeVisible();

    await page.getByRole("button", { name: "Quitar MAYOREO25" }).click();
    await expect(page.getByTestId("total-pedido")).toHaveText("$279.00");
  });

  test("con modoCombinacion 'cascada' en el mock: KARSO10 + BIENVENIDA5 sobre $310.00 → $31.00 + $13.95", async ({ page }) => {
    await editar<ConfiguracionArchivo>(CONFIGURACION_PATH, (a) => {
      a.configuracion.promociones.modoCombinacion = "cascada";
    });
    await borradorConTarjeta(page.request);
    for (const codigo of ["KARSO10", "BIENVENIDA5"]) {
      expect((await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo } })).status()).toBe(200);
    }
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByLabel("Códigos aplicados")).toContainText("BIENVENIDA5 (5 %)−$13.95");
    await expect(page.getByTestId("total-pedido")).toHaveText("$265.05");
  });

  test("BIENVENIDA5: al hacer el pedido se registra, ya no se puede volver a usar y el pago vencido lo libera", async ({
    page,
  }) => {
    await borradorConTarjeta(page.request);
    await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "BIENVENIDA5" } });
    const pedido = await confirmarPorApi(page.request);

    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    await page.goto("/panel/pedidos/nuevo");
    await aplicar(page, "BIENVENIDA5");
    await expect(page.getByText("Ya usaste este código")).toBeVisible();

    // Solo el admin cancela (SPEC 07): el código se libera cuando el pago vence.
    await moverVencimiento(pedido.id);
    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("Cancelado");

    await page.goto("/panel/pedidos/nuevo");
    await aplicar(page, "BIENVENIDA5");
    await expect(page.getByLabel("Códigos aplicados")).toContainText("BIENVENIDA5 (5 %)");
  });

  test("un código que vence en el mock se quita del borrador con aviso; confirmar en ese momento → 409", async ({ page }) => {
    await borradorConTarjeta(page.request);
    await checkoutPorApi(page.request, { sucursalEntregaId: ID.centro });
    await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "KARSO10" } });
    await editarPromociones((a) => {
      promo(a, "KARSO10").vigencia.fin = "2026-11-01T07:00:00Z";
    });

    const res = await page.request.post("/api/pedidos/borrador/confirmar");
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("PROMOCION_INVALIDA");

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("El código KARSO10 ya no es válido: venció")).toBeVisible();
    await expect(page.getByLabel("Códigos aplicados")).toHaveCount(0);
    await expect(page.getByTestId("total-pedido")).toHaveText("$310.00");
  });
});

test.describe("Totales de KARSO 5.4", () => {
  test("tarjeta + lona con BUENFIN10 vigente y factura: $755.86 en el borrador y en el detalle; el pedido queda congelado", async ({
    page,
  }) => {
    await editarPromociones((a) => {
      promo(a, "BUENFIN10").vigencia = { inicio: "2026-11-01T06:00:00Z", fin: "2030-12-31T05:59:59Z" };
    });
    await borradorConTarjeta(page.request);
    await agregarPorApi(page.request, lona(await subirPorApi(page.request, "lona-cmyk.jpg")));
    await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "BUENFIN10" } });
    await checkoutPorApi(page.request, { sucursalEntregaId: ID.centro });

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByTestId("total-pedido")).toHaveText("$651.60"); // sin factura
    await page.getByLabel("Requiero factura").check();
    await llenarDatosFiscales(page, DATOS);
    await formularioFiscal(page).getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(formularioFiscal(page).getByText("Datos guardados")).toBeVisible();
    await expect(page.getByTestId("total-pedido")).toHaveText("$755.86");

    await hacerPedido(page).click();
    await expect(page.getByTestId("total-a-pagar")).toHaveText("$755.86");
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText("Pago aprobado", { exact: true })).toBeVisible();
    const resumen = page.getByTestId("total-pedido").locator("xpath=ancestor::dl");
    await expect(resumen).toContainText("Subtotal$724.00");
    await expect(resumen).toContainText("BUENFIN10 (10 %)−$72.40");
    await expect(resumen).toContainText("IVA (16 %)$104.26");
    await expect(page.getByTestId("total-pedido")).toHaveText("$755.86");
    await expect(page.getByText("PELJ800101ABC")).toBeVisible();

    const [, id] = page.url().match(/\/panel\/pedidos\/([^?]+)/)!;
    const guardado = (await leerOrders()).pedidos.find((p) => p.id === id) as unknown as Record<string, unknown>;
    expect(guardado).toMatchObject({
      sucursalEntregaId: ID.centro,
      requiereFactura: true,
      datosFiscales: DATOS,
      descuento: 72.4,
      baseIva: 651.6,
      tasaIva: 0.16,
      iva: 104.26,
      total: 755.86,
    });

    await editar<ConfiguracionArchivo>(CONFIGURACION_PATH, (a) => {
      a.configuracion.iva.tasa = 0.08;
    });
    await editarPromociones((a) => {
      promo(a, "BUENFIN10").porcentaje = 50;
    });
    await page.reload();
    await expect(page.getByTestId("total-pedido")).toHaveText("$755.86");
  });
});

test.describe("Datos de versiones anteriores", () => {
  test("un orders.json de versión 3 se reemplaza por uno vacío sin romper la app", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const { contadores } = await leerOrders();
    await escribirOrders({ version: 3, ultimoFolio: 9, pedidos: [{ id: "viejo", estado: "borrador", productos: [] }] });

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();
    expect(await leerOrders()).toMatchObject({ version: 7 });
    // Deja los contadores como estaban para que los folios de otros tests sigan la secuencia.
    await escribirOrders({ ...(await leerOrders()), contadores });
  });

  test("un users.json de versión 1 se migra sin perder usuarios y la sesión sigue funcionando", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const ruta = path.join(DATA_DIR, "users.json");
    const actual = JSON.parse(await readFile(ruta, "utf8"));
    const v1 = {
      version: 1,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      users: actual.users.map(({ datosFiscales, usosPromociones, ...user }: Record<string, unknown>) => user),
    };
    await writeFile(ruta, JSON.stringify(v1));

    // El borrador lee el usuario: al cargarlo, users.json ya quedó migrado.
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();
    const migrado = JSON.parse(await readFile(ruta, "utf8"));
    expect(migrado.version).toBe(2);
    expect(migrado.users).toHaveLength(actual.users.length);
    expect(migrado.users.every((u: Record<string, unknown>) => Array.isArray(u.usosPromociones))).toBe(true);
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en el borrador con sucursal, códigos y factura, ni en el detalle", async ({ page }) => {
    await borradorConTarjeta(page.request);
    await page.request.post("/api/pedidos/borrador/promociones", { data: { codigo: "KARSO10" } });
    await checkoutPorApi(page.request, { sucursalEntregaId: ID.cumbres, requiereFactura: true, datosFiscales: DATOS });

    await page.goto("/panel/pedidos/nuevo");
    await expect(formularioFiscal(page).getByText("Datos guardados")).toBeVisible();
    await sinScrollHorizontal(page);

    await hacerPedido(page).click();
    await expect(page.getByRole("button", { name: "Aprobar" })).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
