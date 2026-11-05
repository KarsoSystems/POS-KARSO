import { expect, test } from "@playwright/test";
import { crearCuentaActiva } from "./helpers";
import { editarBanners, ID, opcion, restaurarMock } from "./pedidos-helpers";

// Las vigencias se fijan relativas a hoy para que el test no caduque con el calendario.
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const BUEN_FIN = "Buen Fin: 10% en tarjetas";

/** Pone al banner "Buen Fin" una vigencia de `inicio` a `fin` días desde hoy. */
const vigenciaBuenFin = (inicio: number, fin: number) =>
  editarBanners((a) => {
    a.banners.find((b) => b.titulo === BUEN_FIN)!.vigencia = { inicio: dias(inicio), fin: dias(fin) };
  });

test.afterEach(restaurarMock);

test.describe("Banners del inicio del panel", () => {
  test("muestra los vigentes en su orden; el de vigencia futura y el inactivo no aparecen", async ({ page }) => {
    await vigenciaBuenFin(30, 34);
    await crearCuentaActiva(page.request);
    await page.goto("/panel");

    const carrusel = page.getByRole("region", { name: "Promociones" });
    await expect(carrusel.getByRole("listitem")).toHaveCount(2);
    expect(await carrusel.getByRole("img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("alt")))).toEqual([
      "Tarjetas de presentación desde $115 el millar",
      "Lonas a la medida desde $55 el m²",
    ]);
    await expect(carrusel.getByRole("img", { name: BUEN_FIN })).toHaveCount(0);
    await expect(carrusel.getByRole("img", { name: "Volantes para tu negocio" })).toHaveCount(0);

    const primera = carrusel.getByRole("img").first();
    expect(await primera.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\/mock\/banners\/tarjetas\.svg$/);
    expect(await primera.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test("dentro de su vigencia, el Buen Fin aparece primero (orden 0)", async ({ page }) => {
    await vigenciaBuenFin(-1, 1);
    await crearCuentaActiva(page.request);
    await page.goto("/panel");
    const carrusel = page.getByRole("region", { name: "Promociones" });
    await expect(carrusel.getByRole("listitem")).toHaveCount(3);
    await expect(carrusel.getByRole("img").first()).toHaveAccessibleName(BUEN_FIN);
  });

  test("no avanza solo; las flechas desplazan y el banner abre el editor con su producto", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel");
    const pista = page.getByRole("region", { name: "Promociones" }).getByRole("list");
    await expect(pista.getByRole("listitem").first()).toBeVisible();

    const inicio = await pista.evaluate((ul) => ul.scrollLeft);
    await page.waitForTimeout(3000);
    expect(await pista.evaluate((ul) => ul.scrollLeft)).toBe(inicio);

    await page.getByRole("button", { name: "Banner siguiente" }).click();
    await expect.poll(() => pista.evaluate((ul) => ul.scrollLeft)).toBeGreaterThan(inicio);

    await pista.getByRole("link", { name: /Lonas a la medida/ }).click();
    await expect(page).toHaveURL(new RegExp(`/panel/pedidos/nuevo/item\\?producto=${ID.lona}$`));
    await expect(opcion(page, /^Lona 13 oz/)).toHaveAttribute("aria-checked", "true");
  });

  test("un ?producto= inexistente abre el editor sin producto elegido", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo/item?producto=no-existe");
    await expect(opcion(page, /^Tarjeta/)).toBeVisible();
    await expect(page.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
  });

  test("sin banners vigentes no se muestra el carrusel", async ({ page }) => {
    await editarBanners((a) => {
      a.banners.forEach((b) => (b.activo = false));
    });
    await crearCuentaActiva(page.request);
    await page.goto("/panel");
    await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Promociones" })).toHaveCount(0);
  });

  test.describe("375 px", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("usa la imagen móvil", async ({ page }) => {
      await crearCuentaActiva(page.request);
      await page.goto("/panel");
      const primera = page.getByRole("region", { name: "Promociones" }).getByRole("img").first();
      await expect(primera).toBeVisible();
      expect(await primera.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/tarjetas-movil\.svg$/);
    });
  });
});
