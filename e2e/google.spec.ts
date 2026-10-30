import { expect, test } from "@playwright/test";
import { correoUnico, crearCuentaActiva, datosRegistro, verificarConAviso } from "./helpers";

async function continuarConGoogle(page: import("@playwright/test").Page, nombre: string, correo: string) {
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Simulación de Google")).toBeVisible();
  await dialogo.getByLabel("Nombre en Google").fill(nombre);
  await dialogo.getByLabel("Correo de Google").fill(correo);
  await dialogo.getByRole("button", { name: "Continuar" }).click();
}

test("Google con correo nuevo → completar perfil (nombre precargado) → verificar → panel", async ({ page }) => {
  await page.goto("/login");
  await continuarConGoogle(page, "Luis Pérez", correoUnico("google"));

  await expect(page).toHaveURL(/\/registro\/completar$/);
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Luis Pérez");
  await page.getByLabel("Apellido paterno").fill("Pérez");
  await page.getByLabel("Apellido materno").fill("Soto");
  await page.getByLabel("WhatsApp").fill("3312345678");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page).toHaveURL(/\/registro\/verificar$/);
  await verificarConAviso(page);
  await expect(page.getByRole("heading", { name: "Hola, Luis Pérez" })).toBeVisible();
});

test("Google con el correo de una cuenta por contraseña entra a la misma cuenta y agrega google", async ({
  page,
  context,
}) => {
  const datos = datosRegistro();
  const cuenta = await crearCuentaActiva(context.request, datos);
  await context.clearCookies();

  await page.goto("/registro");
  await continuarConGoogle(page, "Otro Nombre", datos.correo.toUpperCase());

  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByText(`Tu número de cliente: ${cuenta.idCliente}`)).toBeVisible();
  const { user } = await (await page.request.get("/api/auth/me")).json();
  expect(user.idCliente).toBe(cuenta.idCliente);
  expect(user.providers).toEqual(["password", "google"]);
});
