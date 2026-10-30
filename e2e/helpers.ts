import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Cada test usa correos únicos: no dependen del orden ni de datos previos.
export const correoUnico = (prefijo = "e2e") =>
  `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ejemplo.com`;

export const PASSWORD = "secreto123";

export interface DatosRegistro {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  whatsapp: string;
  correo: string;
  password: string;
}

export const datosRegistro = (overrides: Partial<DatosRegistro> = {}): DatosRegistro => ({
  nombre: "Ana",
  apellidoPaterno: "López",
  apellidoMaterno: "García",
  whatsapp: "5512345678",
  correo: correoUnico(),
  password: PASSWORD,
  ...overrides,
});

const ETIQUETAS: Record<keyof DatosRegistro, string> = {
  nombre: "Nombre",
  apellidoPaterno: "Apellido paterno",
  apellidoMaterno: "Apellido materno",
  whatsapp: "WhatsApp",
  correo: "Correo",
  password: "Contraseña",
};

export async function llenarRegistro(page: Page, datos: DatosRegistro) {
  for (const [campo, etiqueta] of Object.entries(ETIQUETAS)) {
    await page.getByLabel(etiqueta, { exact: true }).fill(datos[campo as keyof DatosRegistro]);
  }
}

/** Registra por la UI y deja la página en /registro/verificar. */
export async function registrarPorUI(page: Page, datos = datosRegistro()) {
  await page.goto("/registro");
  await llenarRegistro(page, datos);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/registro\/verificar$/);
  return datos;
}

/** Lee el código del aviso de demo en /registro/verificar. */
export async function codigoDelAviso(page: Page): Promise<string> {
  const aviso = page.getByText(/Modo demo: tu código es/);
  await expect(aviso).toBeVisible();
  return (await aviso.innerText()).match(/\d{6}/)![0];
}

export async function verificarConAviso(page: Page) {
  await page.getByLabel("Código de verificación").fill(await codigoDelAviso(page));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

/** Crea una cuenta activa por la API (comparte cookies con la página). */
export async function crearCuentaActiva(request: APIRequestContext, datos = datosRegistro()) {
  const registro = await request.post("/api/auth/registro", { data: datos });
  expect(registro.status()).toBe(201);
  const { demoCodigo } = await registro.json();
  const verificacion = await request.post("/api/auth/verificar-whatsapp", { data: { codigo: demoCodigo } });
  expect(verificacion.status()).toBe(200);
  return (await verificacion.json()).user as { idCliente: string; nombre: string };
}

export async function sinScrollHorizontal(page: Page) {
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda, `scroll horizontal en ${page.url()}`).toBe(false);
}

/** Código de 6 dígitos distinto al dado. */
export const otroCodigo = (codigo: string) =>
  String((Number(codigo) + 1) % 1_000_000).padStart(6, "0");
