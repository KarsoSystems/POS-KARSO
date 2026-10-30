import { expect, test } from "@playwright/test";
import {
  codigoDelAviso,
  crearCuentaActiva,
  datosRegistro,
  llenarRegistro,
  otroCodigo,
  PASSWORD,
  registrarPorUI,
  verificarConAviso,
} from "./helpers";

test.describe("Registro", () => {
  test("registro → verificación con el código del aviso → panel con nombre e idCliente", async ({ page }) => {
    await registrarPorUI(page);
    await verificarConAviso(page);
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    await expect(page.getByText(/Tu número de cliente: CLI-\d{6}/)).toBeVisible();
  });

  test("WhatsApp inválido y contraseña sin número marcan error y no llaman a la API", async ({ page }) => {
    const llamadas: string[] = [];
    page.on("request", (r) => r.url().includes("/api/") && llamadas.push(r.url()));

    await page.goto("/registro");
    await llenarRegistro(page, datosRegistro({ whatsapp: "551234567", password: "abcdefgh" }));
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText("El WhatsApp debe tener 10 dígitos")).toBeVisible();
    await expect(page.getByText("La contraseña debe incluir al menos un número")).toBeVisible();
    expect(llamadas).toEqual([]);
    await expect(page).toHaveURL(/\/registro$/);
  });

  test("un correo ya registrado (con otras mayúsculas) muestra el error en el campo", async ({ page, request }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(request, datos);

    await page.goto("/registro");
    await llenarRegistro(page, { ...datos, correo: datos.correo.toUpperCase() });
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Este correo ya está registrado")).toBeVisible();
  });
});

test.describe("Verificación de WhatsApp", () => {
  test("código incorrecto, y el 5.º fallo invalida el código", async ({ page }) => {
    await registrarPorUI(page);
    const codigo = await codigoDelAviso(page);
    const campo = page.getByLabel("Código de verificación");
    const verificar = page.getByRole("button", { name: "Verificar" });

    await campo.fill(otroCodigo(codigo));
    await verificar.click();
    await expect(page.getByText("Código incorrecto. Te quedan 4 intentos.")).toBeVisible();

    for (const quedan of [3, 2, 1]) {
      await campo.fill(otroCodigo(codigo));
      await verificar.click();
      await expect(page.getByText(`Te quedan ${quedan} intento`)).toBeVisible();
    }
    await campo.fill(otroCodigo(codigo));
    await verificar.click();
    await expect(page.getByText("Demasiados intentos. Solicita un código nuevo.")).toBeVisible();

    // Ni el código correcto sirve ya: hay que reenviar.
    await campo.fill(codigo);
    await verificar.click();
    await expect(page.getByText("No hay un código vigente. Solicita uno nuevo.")).toBeVisible();
    await expect(page).toHaveURL(/\/registro\/verificar$/);
  });

  test("reenviar está deshabilitado con cuenta regresiva y la API responde 429", async ({ page }) => {
    await registrarPorUI(page);
    const reenviar = page.getByRole("button", { name: /Reenviar código en \d+ s/ });
    await expect(reenviar).toBeDisabled();

    const res = await page.request.post("/api/auth/reenviar-codigo");
    expect(res.status()).toBe(429);
    expect(Number(res.headers()["retry-after"])).toBeGreaterThan(0);
  });
});

test.describe("Login", () => {
  test("contraseña incorrecta y correo inexistente muestran el mismo mensaje", async ({ page, request }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(request, datos);

    for (const [correo, password] of [
      [datos.correo, "otra12345"],
      ["nadie-existe@ejemplo.com", PASSWORD],
    ]) {
      await page.goto("/login");
      await page.getByLabel("Correo").fill(correo);
      await page.getByLabel("Contraseña").fill(password);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await expect(page.locator("[data-slot=alert]")).toHaveText("Correo o contraseña incorrectos");
    }
  });

  test("login correcto de una cuenta activa lleva al panel", async ({ page, request }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(request, datos);

    await page.goto("/login");
    await page.getByLabel("Correo").fill(datos.correo);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
  });
});
