import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { correoUnico, crearCuentaActiva, datosRegistro, PASSWORD, sinScrollHorizontal } from "./helpers";
import { agregarPorApi, checkoutPorApi, confirmarPorApi, subirPorApi, tarjeta } from "./pedidos-helpers";
import { DATA_DIR } from "./rutas";

// "Mi perfil" (SPEC 10; KARSO 5.1 y 6.1): tarjetas que se guardan por separado.
// Nombre y correo no se editan; el teléfono nuevo se verifica con código.

const DIRECCION = { calle: "Av. Juárez 123", colonia: "Centro", ciudad: "Monterrey", estado: "Nuevo León", codigoPostal: "64000" };
const FISCALES = {
  rfc: "PELJ800101ABC",
  razonSocial: "JUAN PEREZ LOPEZ",
  regimenFiscal: "612",
  codigoPostal: "64000",
  usoCfdi: "G03",
  correoFactura: "facturas@elaguila.com",
};

const tarjetaDe = (page: Page, nombre: string) => page.getByRole("form", { name: nombre });
const leerUsuario = async (correo: string) => {
  const { users } = JSON.parse(await readFile(path.join(DATA_DIR, "users.json"), "utf8"));
  return users.find((u: { correo: string }) => u.correo === correo);
};

async function abrirPerfil(page: Page) {
  await page.goto("/panel/perfil");
  await expect(page.getByText("Número de cliente")).toBeVisible();
}

/** Inicia sesión con correo y contraseña en un contexto nuevo; devuelve si entró al panel. */
async function entra(browser: Browser, baseURL: string, correo: string, password: string) {
  const contexto = await browser.newContext({ baseURL });
  const res = await contexto.request.post("/api/auth/login", { data: { correo, password } });
  await contexto.close();
  return res.status() === 200;
}

/** Cuenta que solo entra con Google (simulado), ya activa. */
async function cuentaDeGoogle(request: APIRequestContext) {
  const correo = correoUnico("google");
  expect((await request.post("/api/auth/google-mock", { data: { nombre: "Luis", correo } })).status()).toBe(201);
  const perfil = await request.post("/api/auth/completar-perfil", {
    data: { nombre: "Luis", apellidoPaterno: "Pérez", apellidoMaterno: "Soto", whatsapp: "5511112222" },
  });
  const { demoCodigo } = await perfil.json();
  expect((await request.post("/api/auth/verificar-whatsapp", { data: { codigo: demoCodigo } })).status()).toBe(200);
  return correo;
}

test.describe("Datos personales", () => {
  test("número de cliente, nombre y correo de solo lectura", async ({ page }) => {
    const datos = datosRegistro();
    const user = await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    const personales = page.getByLabel("Datos personales");
    await expect(personales).toContainText(user.idCliente);
    await expect(personales).toContainText("Ana López García");
    await expect(personales).toContainText(datos.correo);
    await expect(page.getByText("El nombre y el correo no se pueden cambiar.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Correo", exact: true })).toHaveCount(0);
  });
});

test.describe("Dirección y negocio", () => {
  test("socio sin negocio ni dirección no guarda; con todo, sí; de vuelta a ocasional se borra el negocio y queda la dirección", async ({
    page,
  }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    const form = tarjetaDe(page, "Dirección y negocio");

    await form.getByLabel("Soy socio (tengo un negocio)").check();
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(form.getByText("El nombre del negocio es obligatorio para socios")).toBeVisible();
    await expect(form.getByText("La dirección es obligatoria para socios")).toBeVisible();
    expect(await leerUsuario(datos.correo)).toMatchObject({ tipo: "ocasional", nombreNegocio: null });

    await form.getByLabel("Nombre del negocio").fill("Imprenta El Águila");
    await form.getByLabel("Calle y número").fill(DIRECCION.calle);
    await form.getByLabel("Colonia").fill(DIRECCION.colonia);
    await form.getByLabel("Ciudad").fill(DIRECCION.ciudad);
    await form.getByLabel("Estado").fill(DIRECCION.estado);
    await form.getByLabel("Código postal").fill("640");
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(form.getByText("El código postal debe tener 5 dígitos")).toBeVisible();
    await form.getByLabel("Código postal").fill(DIRECCION.codigoPostal);
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(form.getByText("Dirección guardada")).toBeVisible();
    expect(await leerUsuario(datos.correo)).toMatchObject({ tipo: "socio", nombreNegocio: "Imprenta El Águila", direccion: DIRECCION });

    await page.reload();
    await expect(form.getByLabel("Nombre del negocio")).toHaveValue("Imprenta El Águila");
    await form.getByLabel("Soy socio (tengo un negocio)").uncheck();
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(form.getByText("Dirección guardada")).toBeVisible();
    expect(await leerUsuario(datos.correo)).toMatchObject({ tipo: "ocasional", nombreNegocio: null, direccion: DIRECCION });
  });

  test("un ocasional guarda sin dirección; una dirección a medias da error en su campo", async ({ page }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    const form = tarjetaDe(page, "Dirección y negocio");
    await form.getByLabel("Calle y número").fill(DIRECCION.calle);
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(form.getByText("La colonia es obligatoria")).toBeVisible();
    await form.getByLabel("Calle y número").fill("");
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(form.getByText("Dirección guardada")).toBeVisible();
    expect(await leerUsuario(datos.correo)).toMatchObject({ tipo: "ocasional", direccion: null });
  });
});

test.describe("Datos fiscales", () => {
  test("se guardan en el perfil, el checkout los precarga, se borran y el pedido hecho conserva su copia", async ({ page }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    const form = tarjetaDe(page, "Datos fiscales");
    await expect(form.getByLabel("Guardar en mi perfil")).toHaveCount(0);
    await form.getByLabel("RFC").fill("XYZ");
    await form.getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(form.getByText("RFC inválido")).toBeVisible();

    await form.getByLabel("RFC").fill(FISCALES.rfc);
    await form.getByLabel("Código postal").fill(FISCALES.codigoPostal);
    await form.getByLabel("Razón social").fill(FISCALES.razonSocial);
    await form.getByLabel("Régimen fiscal").selectOption(FISCALES.regimenFiscal);
    await form.getByLabel("Uso del CFDI").selectOption(FISCALES.usoCfdi);
    await form.getByLabel("Correo para la factura").fill(FISCALES.correoFactura);
    await form.getByRole("button", { name: "Guardar datos fiscales" }).click();
    await expect(form.getByText("Datos guardados")).toBeVisible();

    // El checkout los precarga al pedir factura (SPEC 06).
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    await page.goto("/panel/pedidos/nuevo");
    await page.getByLabel("Requiero factura").check();
    await expect(page.getByRole("form", { name: "Datos fiscales" }).getByLabel("RFC")).toHaveValue(FISCALES.rfc);
    await checkoutPorApi(page.request, { requiereFactura: true });
    const pedido = await confirmarPorApi(page.request);

    await abrirPerfil(page);
    await page.getByRole("button", { name: "Borrar datos fiscales" }).click();
    await expect(page.getByText("Datos fiscales borrados.")).toBeVisible();
    await expect(form.getByLabel("RFC")).toHaveValue("");
    expect((await leerUsuario(datos.correo)).datosFiscales).toBeNull();

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByText(FISCALES.rfc)).toBeVisible();
  });
});

test.describe("Contraseña", () => {
  test("al cambiarla, la nueva inicia sesión y la anterior ya no; si no coinciden, error", async ({ page, browser, baseURL }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    const form = tarjetaDe(page, "Cambiar contraseña");
    await form.getByLabel("Nueva contraseña").fill("nueva12345");
    await form.getByLabel("Confirma la contraseña").fill("otra12345");
    await form.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(form.getByText("Las contraseñas no coinciden")).toBeVisible();

    // Pide la actual (SPEC 11): sin ella o incorrecta, error en su campo.
    await form.getByLabel("Confirma la contraseña").fill("nueva12345");
    await form.getByLabel("Contraseña actual").fill("equivocada1");
    await form.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(form.getByText("La contraseña actual no es correcta")).toBeVisible();

    await form.getByLabel("Contraseña actual").fill(PASSWORD);
    await form.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(form.getByText("Contraseña guardada. Cerramos tus otras sesiones.")).toBeVisible();
    expect(await entra(browser, baseURL!, datos.correo, PASSWORD)).toBe(false);
    expect(await entra(browser, baseURL!, datos.correo, "nueva12345")).toBe(true);
  });

  test("una cuenta de Google crea su contraseña y después entra con correo y contraseña", async ({ page, browser, baseURL }) => {
    const correo = await cuentaDeGoogle(page.request);
    await abrirPerfil(page);
    const form = tarjetaDe(page, "Crear contraseña");
    await expect(form).toBeVisible();
    await form.getByLabel("Nueva contraseña").fill("creada123");
    await form.getByLabel("Confirma la contraseña").fill("creada123");
    await form.getByRole("button", { name: "Crear contraseña" }).click();
    // Ya tiene contraseña: la tarjeta pasa a "Cambiar contraseña".
    await expect(tarjetaDe(page, "Cambiar contraseña").getByText("Contraseña guardada")).toBeVisible();
    expect((await leerUsuario(correo)).providers).toEqual(["google", "password"]);
    expect(await entra(browser, baseURL!, correo, "creada123")).toBe(true);
  });
});

test.describe("Teléfono", () => {
  test("el número cambia solo al verificar; con un código incorrecto sigue el anterior; se retoma al recargar", async ({ page }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    await expect(page.getByTestId("telefono-actual")).toHaveText("+52 55 1234 5678");

    await page.getByRole("button", { name: "Cambiar teléfono" }).click();
    const pedir = tarjetaDe(page, "Cambiar teléfono");
    await pedir.getByLabel("Número nuevo de WhatsApp").fill("55 1234 5678");
    await pedir.getByRole("button", { name: "Enviar código" }).click();
    await expect(pedir.getByText("Ese ya es tu número")).toBeVisible();
    await pedir.getByLabel("Número nuevo de WhatsApp").fill("81 8765 4321");
    await pedir.getByRole("button", { name: "Enviar código" }).click();

    const aviso = page.getByText(/Modo demo: tu código es/);
    await expect(aviso).toBeVisible();
    const codigo = (await aviso.innerText()).match(/\d{6}/)![0];
    await expect(page.getByText("Enviamos un código de 6 dígitos a +52 81 8765 4321")).toBeVisible();
    await expect(page.getByRole("button", { name: /Reenviar código en \d+ s/ })).toBeDisabled();
    expect((await leerUsuario(datos.correo)).whatsapp).toBe("+525512345678");

    // Al recargar, el cambio sigue en curso.
    await page.reload();
    const verificar = tarjetaDe(page, "Verificar el número nuevo");
    await expect(verificar).toBeVisible();

    const otro = String((Number(codigo) + 1) % 1_000_000).padStart(6, "0");
    await verificar.getByLabel("Código de verificación").fill(otro);
    await verificar.getByRole("button", { name: "Confirmar número" }).click();
    await expect(verificar.getByText("Código incorrecto. Te quedan 4 intentos.")).toBeVisible();
    await expect(page.getByTestId("telefono-actual")).toHaveText("+52 55 1234 5678");

    await verificar.getByLabel("Código de verificación").fill(codigo);
    await verificar.getByRole("button", { name: "Confirmar número" }).click();
    await expect(page.getByText("Teléfono actualizado")).toBeVisible();
    await expect(page.getByTestId("telefono-actual")).toHaveText("+52 81 8765 4321");
    expect((await leerUsuario(datos.correo)).whatsapp).toBe("+528187654321");
  });

  test("cancelar el cambio deja el número anterior", async ({ page }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await abrirPerfil(page);
    await page.getByRole("button", { name: "Cambiar teléfono" }).click();
    await tarjetaDe(page, "Cambiar teléfono").getByLabel("Número nuevo de WhatsApp").fill("8187654321");
    await tarjetaDe(page, "Cambiar teléfono").getByRole("button", { name: "Enviar código" }).click();
    await tarjetaDe(page, "Verificar el número nuevo").getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("button", { name: "Cambiar teléfono" })).toBeVisible();
    await expect(page.getByTestId("telefono-actual")).toHaveText("+52 55 1234 5678");
    expect((await page.request.get("/api/perfil/telefono").then((r) => r.json())).whatsappNuevo).toBeNull();
  });
});

test.describe("Datos de versiones anteriores", () => {
  test("un users.json de versión 2 se migra a la 3 sin perder usuarios y la sesión sigue", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const ruta = path.join(DATA_DIR, "users.json");
    const actual = JSON.parse(await readFile(ruta, "utf8"));
    const v2 = {
      version: 2,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      users: actual.users.map(({ tipo, direccion, nombreNegocio, ...user }: Record<string, unknown>) => user),
    };
    await writeFile(ruta, JSON.stringify(v2));

    await abrirPerfil(page);
    const migrado = JSON.parse(await readFile(ruta, "utf8"));
    expect(migrado.version).toBe(3);
    expect(migrado.users).toHaveLength(actual.users.length);
    expect(migrado.users.every((u: Record<string, unknown>) => u.tipo === "ocasional" || u.tipo === "socio")).toBe(true);
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en el perfil, con socio y con un cambio de teléfono en curso", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await abrirPerfil(page);
    await tarjetaDe(page, "Dirección y negocio").getByLabel("Soy socio (tengo un negocio)").check();
    await sinScrollHorizontal(page);
    await page.getByRole("button", { name: "Cambiar teléfono" }).click();
    await tarjetaDe(page, "Cambiar teléfono").getByLabel("Número nuevo de WhatsApp").fill("8187654321");
    await tarjetaDe(page, "Cambiar teléfono").getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByText(/Modo demo: tu código es/)).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
