import { expect, test } from "@playwright/test";
import {
  correoUnico,
  crearCuentaActiva,
  datosRegistro,
  PASSWORD,
  registrarPorUI,
  sinScrollHorizontal,
} from "./helpers";

test.describe("Middleware", () => {
  test("/panel sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/panel con verificacion_pendiente redirige a /registro/verificar", async ({ page }) => {
    await page.request.post("/api/auth/registro", { data: datosRegistro() });
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/registro\/verificar$/);
  });

  test("/panel con perfil_incompleto redirige a /registro/completar", async ({ page }) => {
    await page.request.post("/api/auth/google-mock", { data: { nombre: "Luis", correo: correoUnico() } });
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/registro\/completar$/);
  });

  test("con sesión activa, /login redirige a /panel", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/panel$/);
  });
});

test.describe("Sesión", () => {
  test("la cookie acceso es HttpOnly y no se lee desde document.cookie (SPEC 11)", async ({ page, context }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel");
    const acceso = (await context.cookies()).find((c) => c.name === "acceso");
    expect(acceso?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain("acceso=");
  });

  test("cerrar sesión borra las cookies, va a /login y atrás no muestra el panel", async ({ page, context }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await context.clearCookies();

    await page.goto("/login");
    await page.getByLabel("Correo").fill(datos.correo);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).find((c) => c.name === "acceso" || c.name === "renovacion")).toBeUndefined();

    await page.goBack();
    await expect(page.getByText("Hola, Ana")).toHaveCount(0);
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Panel", () => {
  test("Mis pedidos y Mi perfil están habilitados (SPEC 10)", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel");
    const menu = page.locator("aside").getByRole("navigation", { name: "Menú del panel" });
    await expect(menu.getByText("Próximamente")).toHaveCount(0);

    const perfil = menu.getByRole("link", { name: "Mi perfil" });
    await expect(perfil).not.toHaveAttribute("aria-disabled");
    await perfil.click();
    await expect(page).toHaveURL(/\/panel\/perfil$/);
    await expect(perfil).toHaveAttribute("aria-current", "page");

    const pedidos = menu.getByRole("link", { name: "Mis pedidos" });
    await expect(pedidos).not.toHaveAttribute("aria-disabled");
    await pedidos.click();
    await expect(page).toHaveURL(/\/panel\/pedidos$/);
    await expect(pedidos).toHaveAttribute("aria-current", "page");
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en login, registro, verificación y panel", async ({ page }) => {
    await page.goto("/login");
    await sinScrollHorizontal(page);
    await page.goto("/registro");
    await sinScrollHorizontal(page);

    await registrarPorUI(page);
    await expect(page.getByText(/Modo demo/)).toBeVisible();
    await sinScrollHorizontal(page);

    const aviso = await page.getByText(/Modo demo: tu código es/).innerText();
    await page.getByLabel("Código de verificación").fill(aviso.match(/\d{6}/)![0]);
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    await sinScrollHorizontal(page);

    // Debajo de 768 px el menú vive en un drawer.
    await expect(page.locator("aside")).toBeHidden();
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Mi perfil" })).toBeVisible();
  });
});
