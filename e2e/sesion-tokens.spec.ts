import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createLocalJWKSet, decodeJwt, importPKCS8, jwtVerify, SignJWT } from "jose";
import { crearCuentaActiva, datosRegistro, PASSWORD, sinScrollHorizontal } from "./helpers";
import { DATA_DIR } from "./rutas";

// SPEC 11: tokens de acceso (15 min) y de renovación (7 días, rotado), firmados con
// RS256 y publicados en el JWKS. El servidor de e2e conserva los 15 min (decisión
// del usuario): para probar un acceso vencido, el test firma uno ya vencido de la
// misma sesión con la llave de e2e, en lugar de esperar o acortar el de todas las suites.

const KID = "e2e-1";
const ISSUER = "http://localhost:3100";

interface SesionGuardada {
  id: string;
  userId: string;
  jtiVigente: string;
  jtiAnterior: string | null;
  renovadaEn: string;
  revocadaEn: string | null;
  motivoRevocacion: string | null;
}

async function leerSesiones(): Promise<SesionGuardada[]> {
  return JSON.parse(await readFile(path.join(DATA_DIR, "sesiones.json"), "utf8")).sesiones;
}

const sesion = async (sid: string) => (await leerSesiones()).find((s) => s.id === sid)!;

async function cookie(context: BrowserContext, nombre: string) {
  return (await context.cookies()).find((c) => c.name === nombre);
}

/** Los datos del token de acceso del navegador (sin verificar: solo para leer el sid). */
async function accesoDe(context: BrowserContext) {
  return decodeJwt((await cookie(context, "acceso"))!.value) as { sub: string; sid: string; idCliente: string; estado: string };
}

/** Cambia la cookie `acceso` por un token de la misma sesión que venció hace un minuto. */
async function vencerAcceso(context: BrowserContext) {
  const { sub, sid, idCliente, estado } = await accesoDe(context);
  const ahora = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ sid, idCliente, estado })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(ISSUER)
    .setAudience("tienda")
    .setSubject(sub)
    .setIssuedAt(ahora - 16 * 60)
    .setExpirationTime(ahora - 60)
    .sign(await importPKCS8(process.env.E2E_AUTH_PRIVATE_KEY!, "RS256"));
  await context.addCookies([{ name: "acceso", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

/** Otro navegador con sesión de la misma cuenta (login con correo y contraseña). */
async function otroNavegador(browser: Browser, baseURL: string, correo: string) {
  const context = await browser.newContext({ baseURL });
  expect((await context.request.post("/api/auth/login", { data: { correo, password: PASSWORD } })).status()).toBe(200);
  return { context, page: await context.newPage() };
}

async function abrirPerfil(page: Page) {
  await page.goto("/panel/perfil");
  await expect(page.getByText("Número de cliente")).toBeVisible();
}

test.describe("Cookies y JWKS", () => {
  test("al iniciar sesión quedan acceso (lax, /) y renovacion (strict, /api/auth), httpOnly, y la sesión en sesiones.json", async ({
    page,
    context,
  }) => {
    const user = await crearCuentaActiva(page.request);
    await page.goto("/panel");

    expect(await cookie(context, "acceso")).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(await cookie(context, "renovacion")).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/auth" });
    expect(await cookie(context, "session")).toBeUndefined();
    const visibles = await page.evaluate(() => document.cookie);
    expect(visibles).not.toContain("acceso=");
    expect(visibles).not.toContain("renovacion=");

    const { sid, idCliente } = await accesoDe(context);
    expect(idCliente).toBe(user.idCliente);
    expect(await sesion(sid)).toMatchObject({ revocadaEn: null });
  });

  test("el token de acceso se verifica solo con /.well-known/jwks.json", async ({ page, context }) => {
    const user = await crearCuentaActiva(page.request);
    const respuesta = await page.request.get("/.well-known/jwks.json");
    expect(respuesta.status()).toBe(200);
    const jwks = await respuesta.json();
    expect(jwks.keys).toHaveLength(1);
    expect(Object.keys(jwks.keys[0]).sort()).toEqual(["alg", "e", "kid", "kty", "n", "use"]);
    expect(jwks.keys[0]).toMatchObject({ kid: KID, alg: "RS256", use: "sig" });

    const { payload, protectedHeader } = await jwtVerify((await cookie(context, "acceso"))!.value, createLocalJWKSet(jwks), {
      issuer: ISSUER,
      audience: "tienda",
    });
    expect(protectedHeader).toMatchObject({ alg: "RS256", kid: KID });
    expect(payload).toMatchObject({ idCliente: user.idCliente, estado: "activo" });
    expect(payload.sid).toEqual(expect.any(String));
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
  });
});

test.describe("Renovación", () => {
  test("con el acceso vencido, navegar al panel lo muestra sin login y la renovación rota el jti", async ({ page, context }) => {
    await crearCuentaActiva(page.request);
    const { sid } = await accesoDe(context);
    const antes = (await sesion(sid)).jtiVigente;

    await vencerAcceso(context);
    await page.goto("/panel/perfil?x=1");
    await expect(page).toHaveURL(/\/panel\/perfil\?x=1$/);
    await expect(page.getByText("Número de cliente")).toBeVisible();

    expect((await sesion(sid)).jtiVigente).not.toBe(antes);
    expect((await accesoDe(context)).sid).toBe(sid);
  });

  test("con el acceso vencido, una llamada a la API responde bien tras una sola renovación", async ({ page, context }) => {
    await crearCuentaActiva(page.request);
    await abrirPerfil(page);
    const { sid } = await accesoDe(context);
    const antes = (await sesion(sid)).jtiVigente;

    const renovaciones: string[] = [];
    page.on("request", (r) => r.url().endsWith("/api/auth/renovar") && renovaciones.push(r.method()));
    await vencerAcceso(context);
    await page.getByRole("button", { name: "Cerrar sesión en los demás dispositivos" }).click();
    await page.getByRole("button", { name: "Cerrar sesiones" }).click();
    await expect(page.getByText("No había otras sesiones abiertas.")).toBeVisible();

    expect(renovaciones).toEqual(["POST"]);
    expect((await sesion(sid)).jtiVigente).not.toBe(antes);
  });

  test("reusar un token de renovación ya rotado cierra la sesión (reuso) y hay que iniciar sesión otra vez", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    await crearCuentaActiva(page.request);
    const { sid } = await accesoDe(context);
    const robada = (await cookie(context, "renovacion"))!;

    // El dueño renueva: el token copiado queda rotado.
    expect((await page.request.post("/api/auth/renovar")).status()).toBe(200);
    // Pasó el periodo de gracia de 10 s (dos pestañas) sin esperarlo de verdad.
    const archivo = path.join(DATA_DIR, "sesiones.json");
    const datos = JSON.parse(await readFile(archivo, "utf8"));
    datos.sesiones.find((s: SesionGuardada) => s.id === sid).renovadaEn = new Date(Date.now() - 60_000).toISOString();
    await writeFile(archivo, JSON.stringify(datos));

    const ladron = await browser.newContext({ baseURL });
    await ladron.addCookies([{ ...robada }]);
    const respuesta = await ladron.request.post("/api/auth/renovar");
    expect(respuesta.status()).toBe(401);
    expect((await respuesta.json()).error.code).toBe("SESION_REVOCADA");
    await ladron.close();

    expect(await sesion(sid)).toMatchObject({ motivoRevocacion: "reuso" });
    // El dueño también queda fuera: la sesión entera se revocó.
    await page.goto("/panel/perfil");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Revocación", () => {
  test("cambiar la contraseña con la actual cierra la sesión del otro navegador y conserva la propia", async ({
    page,
    browser,
    baseURL,
  }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    const otro = await otroNavegador(browser, baseURL!, datos.correo);
    await abrirPerfil(otro.page);

    await abrirPerfil(page);
    const form = page.getByRole("form", { name: "Cambiar contraseña" });
    await form.getByLabel("Contraseña actual").fill(PASSWORD);
    await form.getByLabel("Nueva contraseña").fill("nueva12345");
    await form.getByLabel("Confirma la contraseña").fill("nueva12345");
    await form.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(form.getByText("Contraseña guardada. Cerramos tus otras sesiones.")).toBeVisible();

    // El otro navegador: su token de acceso aún no vence, pero la API ya responde SESION_REVOCADA.
    await otro.page.reload();
    await expect(otro.page).toHaveURL(/\/login$/);
    await otro.context.close();

    await page.reload();
    await expect(page.getByText("Número de cliente")).toBeVisible();
  });

  test("\"Cerrar sesión en los demás dispositivos\" cierra las demás, conserva la actual y dice cuántas", async ({
    page,
    browser,
    baseURL,
  }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    const otros = [await otroNavegador(browser, baseURL!, datos.correo), await otroNavegador(browser, baseURL!, datos.correo)];

    await abrirPerfil(page);
    await page.getByRole("button", { name: "Cerrar sesión en los demás dispositivos" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Esta sesión sigue abierta");
    // Cancelar no cierra nada.
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toHaveCount(0);

    await page.getByRole("button", { name: "Cerrar sesión en los demás dispositivos" }).click();
    await page.getByRole("button", { name: "Cerrar sesiones" }).click();
    await expect(page.getByText("Cerramos 2 sesiones.")).toBeVisible();

    for (const otro of otros) {
      await otro.page.goto("/panel/perfil");
      await expect(otro.page).toHaveURL(/\/login$/);
      await otro.context.close();
    }
    await page.reload();
    await expect(page.getByText("Número de cliente")).toBeVisible();
  });

  test("\"Cerrar sesión\" revoca: el token de acceso copiado antes responde 401 SESION_REVOCADA", async ({ page, context }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel");
    const acceso = (await cookie(context, "acceso"))!.value;
    const { sid } = await accesoDe(context);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await cookie(context, "acceso")).toBeUndefined();
    expect(await cookie(context, "renovacion")).toBeUndefined();
    expect(await sesion(sid)).toMatchObject({ motivoRevocacion: "logout" });

    const respuesta = await page.request.get("/api/auth/me", { headers: { cookie: `acceso=${acceso}` } });
    expect(respuesta.status()).toBe(401);
    expect((await respuesta.json()).error.code).toBe("SESION_REVOCADA");
  });

  test("una cookie session (HS256) de antes se borra y manda a /login conservando siguiente", async ({ page, context }) => {
    await context.addCookies([
      { name: "session", value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.firma", domain: "localhost", path: "/", httpOnly: true },
    ]);
    await page.goto("/panel/pedidos/abc");
    await expect(page).toHaveURL(`/login?siguiente=${encodeURIComponent("/panel/pedidos/abc")}`);
    expect(await cookie(context, "session")).toBeUndefined();
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("Mi perfil sin scroll horizontal con la tarjeta de contraseña, el botón de sesiones y su confirmación", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await abrirPerfil(page);
    await expect(page.getByLabel("Contraseña actual")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión en los demás dispositivos" }).scrollIntoViewIfNeeded();
    await sinScrollHorizontal(page);
    await page.getByRole("button", { name: "Cerrar sesión en los demás dispositivos" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
