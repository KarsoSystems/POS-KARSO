import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { crearCuentaActiva, datosRegistro, PASSWORD, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  editarCatalogo,
  enUploads,
  escribirOrders,
  fixture,
  leerOrders,
  llenarVolante,
  restaurarCatalogo,
  subirPorApi,
  volante,
} from "./pedidos-helpers";

// Varios tests editan el catálogo: siempre se deja como el de git.
test.afterEach(restaurarCatalogo);

const folio = (n: number) => `P-${String(n).padStart(6, "0")}`;

test.describe("Catálogo", () => {
  test("el de ejemplo responde 200; uno inválido responde 500", async ({ page }) => {
    await crearCuentaActiva(page.request);
    expect((await page.request.get("/api/catalogo")).status()).toBe(200);

    await editarCatalogo((c) => {
      c.productos[0].papelesIds.push("papel-fantasma");
    });
    const res = await page.request.get("/api/catalogo");
    expect(res.status()).toBe(500);
    expect((await res.json()).error.code).toBe("CATALOGO_INVALIDO");
  });
});

test.describe("Editor de ítem", () => {
  test("media carta: $2,500.00 en tabloide y $1,625.00 en mesa, en vivo y en orders.json", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo/item");
    await expect(page.getByText("Precios de ejemplo")).toBeVisible();
    await llenarVolante(page);

    const presupuesto = page.locator("dl").filter({ hasText: "Piezas por hoja" });
    await expect(presupuesto).toContainText("2 (girada)");
    await expect(presupuesto).toContainText("500");
    await expect(presupuesto).toContainText("$2,500.00");

    await page.getByRole("radio", { name: /Mesa/ }).check();
    await expect(presupuesto).toContainText("250");
    await expect(presupuesto).toContainText("$1,625.00");

    await page.getByRole("radio", { name: /Tabloide/ }).check();
    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByText("Precios de ejemplo")).toBeVisible();
    await expect(page.getByText("$400.00")).toBeVisible();
    await expect(page.getByText("$2,900.00")).toBeVisible();

    const { pedidos } = await leerOrders();
    const borrador = pedidos.find((p) => p.estado === "borrador" && p.items.length === 1)!;
    expect(borrador.totales).toMatchObject({ subtotalCentavos: 250_000, ivaCentavos: 40_000, totalCentavos: 290_000 });
  });

  test("un cartel tabloide en hoja tabloide no cabe y no se guarda", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo/item");
    await page.getByLabel("Archivo").setInputFiles(fixture("perro.png"));
    await expect(page.getByText(/^PNG ·/)).toBeVisible();
    await page.getByLabel("Producto").selectOption({ label: "Cartel" });
    await page.getByLabel("Cantidad de piezas").fill("10");
    await page.getByRole("radio", { name: /Tabloide/ }).check();

    await expect(page.getByRole("alert").filter({ hasText: "No cabe en Tabloide; sí cabe en Mesa" })).toBeVisible();
    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/item$/);
    expect((await (await page.request.get("/api/pedidos/borrador")).json()).pedido.items).toEqual([]);
  });

  test("acepta JPG, PNG, PDF, AI y PSD; rechaza .exe, .docx y > 50 MB sin guardar nada", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo/item");
    const archivo = page.getByLabel("Archivo");

    for (const [nombre, formato] of [
      ["volante.jpg", "JPG"],
      ["perro.png", "PNG"],
      ["diseno.pdf", "PDF"],
      ["vector.ai", "AI"],
      ["capas.psd", "PSD"],
    ]) {
      await archivo.setInputFiles(fixture(nombre));
      await expect(page.getByText(new RegExp(`^${formato} ·`))).toBeVisible();
      await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
    }

    const antes = await enUploads();
    for (const nombre of ["programa.exe", "carta.docx"]) {
      await archivo.setInputFiles(fixture(nombre));
      await expect(page.getByText("Formato no permitido")).toBeVisible();
    }
    // Playwright no acepta buffers > 50 MB: se escribe a un archivo temporal.
    const enorme = test.info().outputPath("enorme.png");
    await writeFile(enorme, Buffer.alloc(52_428_800 + 1));
    await archivo.setInputFiles(enorme);
    await expect(page.getByText("El archivo supera 50 MB")).toBeVisible();
    expect(await enUploads()).toEqual(antes);

    // También el servidor los rechaza aunque no pasen por el front.
    const exe = await page.request.post("/api/archivos", {
      multipart: { archivo: { name: "programa.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } },
    });
    expect(exe.status()).toBe(415);
    expect(await enUploads()).toEqual(antes);
  });

  test("editar un ítem actualiza el presupuesto en vivo antes de guardar", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    const { items } = await agregarPorApi(page.request, volante(archivoId));

    await page.goto("/panel/pedidos/nuevo");
    await page.getByRole("link", { name: "Editar ítem" }).click();
    await expect(page).toHaveURL(new RegExp(`/item/${items[0].id}$`));
    await expect(page.getByLabel("Cantidad de piezas")).toHaveValue("1000");

    const presupuesto = page.locator("dl").filter({ hasText: "Piezas por hoja" });
    await page.getByRole("radio", { name: /Mesa/ }).check();
    await expect(presupuesto).toContainText("$1,625.00");
    await page.getByLabel("Cantidad de piezas").fill("2000");
    await expect(presupuesto).toContainText("500");
    await expect(presupuesto).toContainText("$3,250.00");

    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByText("$3,770.00")).toBeVisible(); // 3,250 + 520 de IVA
  });

  test("la vista previa dibuja tantas piezas como piezas por hoja, giradas si toca", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo/item");
    await llenarVolante(page);

    const vista = page.getByRole("img", { name: /Vista previa/ });
    await expect(vista).toHaveAccessibleName(/Tabloide 27\.9 × 43\.2 cm · 2 piezas por hoja · 500 hojas/);
    await expect(vista.locator("use")).toHaveCount(2);
    await expect(vista.locator("g[transform*='rotate(90)']")).toHaveCount(1);
    await expect(vista.locator("image")).toHaveCount(1);

    await page.getByRole("radio", { name: /Mesa/ }).check();
    await expect(page.getByText("Mesa 33 × 48.3 cm · 4 piezas por hoja · 250 hojas")).toBeVisible();
    await expect(vista.locator("use")).toHaveCount(4);
    await expect(vista.locator("g[transform*='rotate(90)']")).toHaveCount(0);

    // PDF: rectángulos con el nombre, sin cargar el archivo.
    await page.getByLabel("Archivo").setInputFiles(fixture("diseno.pdf"));
    await expect(page.getByText(/^PDF ·/)).toBeVisible();
    await expect(vista.locator("image")).toHaveCount(0);
    await expect(vista.locator("text")).toHaveText("diseno.pdf");
  });
});

test.describe("Borrador", () => {
  test("miniatura para JPG/PNG e ícono con nombre para PDF, AI y PSD", async ({ page }) => {
    await crearCuentaActiva(page.request);
    for (const nombre of ["volante.jpg", "diseno.pdf"]) {
      await agregarPorApi(page.request, volante(await subirPorApi(page.request, nombre)));
    }
    await page.goto("/panel/pedidos/nuevo");

    const imagen = page.getByRole("img", { name: "volante.jpg" });
    await expect(imagen).toBeVisible();
    expect(await imagen.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("img", { name: "diseno.pdf" })).toHaveCount(0);
    await expect(page.getByText("diseno.pdf")).toBeVisible();
  });

  test("sobrevive a recargar la página y a cerrar y abrir sesión", async ({ page, context }) => {
    const datos = datosRegistro();
    await crearCuentaActiva(page.request, datos);
    await agregarPorApi(page.request, volante(await subirPorApi(page.request, "perro.png")));

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("perro.png")).toBeVisible();
    await page.reload();
    await expect(page.getByText("perro.png")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).find((c) => c.name === "session")).toBeUndefined();
    // Se espera a que el formulario hidrate: si no, el envío nativo no pasa por la API.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Correo").fill(datos.correo);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/panel$/);

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("perro.png")).toBeVisible();
    await expect(page.getByText("$2,900.00")).toBeVisible();
  });

  test("quitar un ítem pide confirmación y borra su archivo de uploads/", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    await agregarPorApi(page.request, volante(archivoId));
    expect(await enUploads()).toContain(`${archivoId}.png`);

    await page.goto("/panel/pedidos/nuevo");
    await page.getByRole("button", { name: "Quitar ítem" }).click();
    await expect(page.getByText("¿Quitar este ítem?")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Quitar ítem" }).click();
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();
    expect(await enUploads()).not.toContain(`${archivoId}.png`);
  });

  test("el ítem 21 no se puede agregar: 'Máximo 20 ítems por pedido'", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    for (let i = 0; i < 20; i++) await agregarPorApi(page.request, volante(archivoId));

    const res = await page.request.post("/api/pedidos/borrador/items", { data: volante(archivoId) });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.message).toBe("Máximo 20 ítems por pedido");

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Máximo 20 ítems por pedido")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar ítem" })).toBeDisabled();
  });

  test("'Hacer pedido' con 0 ítems muestra el aviso y la API responde 422", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();

    await page.getByRole("button", { name: "Hacer pedido" }).click();
    const aviso = page.getByRole("dialog");
    await expect(aviso.getByText("No has agregado nada a tu pedido")).toBeVisible();
    await aviso.getByRole("button", { name: "Regresar al pedido" }).click();
    await expect(aviso).toBeHidden();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);

    await page.getByRole("button", { name: "Hacer pedido" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Ir al inicio del panel" }).click();
    await expect(page).toHaveURL(/\/panel$/);

    const res = await page.request.post("/api/pedidos/borrador/confirmar");
    expect(res.status()).toBe(422);
    expect((await res.json()).error.code).toBe("PEDIDO_VACIO");
  });

  test("si el catálogo deja de tener el papel, el ítem muestra el problema y 'Hacer pedido' se bloquea", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await agregarPorApi(page.request, volante(await subirPorApi(page.request, "perro.png")));
    await editarCatalogo((c) => {
      c.productos.find((p) => p.id === "volante")!.papelesIds = ["bond-90"];
      c.productos.find((p) => p.id === "cartel")!.papelesIds = ["couche-300"];
      c.papeles = c.papeles.filter((p) => p.id !== "couche-150");
    });

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText(/El papel ya no existe en el catálogo/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hacer pedido" })).toBeDisabled();

    const res = await page.request.post("/api/pedidos/borrador/confirmar");
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("ITEMS_CON_PROBLEMAS");
  });
});

test.describe("Archivos", () => {
  test("el archivo de otro usuario responde 404", async ({ page, playwright, baseURL }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    expect((await page.request.get(`/api/archivos/${archivoId}`)).status()).toBe(200);

    const otro = await playwright.request.newContext({ baseURL });
    await crearCuentaActiva(otro);
    expect((await otro.get(`/api/archivos/${archivoId}`)).status()).toBe(404);
    await otro.dispose();
  });
});

test.describe("Hacer pedido, detalle y cancelar", () => {
  test("confirma con folio, pago pendiente y borrador nuevo vacío; aparece en Mis pedidos", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos");
    await expect(page.getByText("Aún no tienes pedidos")).toBeVisible();

    await agregarPorApi(page.request, volante(await subirPorApi(page.request, "perro.png")));
    // En una corrida limpia del demo es el primer pedido: P-000001.
    const esperado = folio((await leerOrders()).ultimoFolio + 1);

    await page.goto("/panel/pedidos/nuevo");
    await page.getByRole("button", { name: "Hacer pedido" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/[\w-]+\?confirmado=1$/);
    await expect(page.getByText(`Pedido ${esperado} recibido`)).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(esperado) })).toContainText("Pedido");
    await expect(page.getByText("Pago pendiente")).toBeVisible();
    await expect(page.getByText("$2,900.00")).toBeVisible();
    await expect(page.getByRole("img", { name: /2 piezas por hoja · 500 hojas/ })).toBeVisible();

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();

    await page.goto("/panel/pedidos");
    const fila = page.getByRole("link", { name: new RegExp(esperado) });
    await expect(fila).toContainText("Pedido");
    await expect(fila).toContainText("1 ítem");
    await expect(fila).toContainText("$2,900.00");
  });

  test("cambiar un precio no altera un pedido confirmado y sí recalcula el borrador", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    await agregarPorApi(page.request, volante(archivoId));
    const { pedido } = await (await page.request.post("/api/pedidos/borrador/confirmar")).json();
    await agregarPorApi(page.request, volante(archivoId));

    await editarCatalogo((c) => {
      c.papeles.find((p) => p.id === "couche-150")!.precioHojaCentavos.tabloide = 600;
    });

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByText("$2,900.00")).toBeVisible();
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("$3,480.00")).toBeVisible(); // 500 hojas × $6.00 + IVA
  });

  test("cancelar pasa a Cancelado; en_proceso no muestra el botón y la API responde 409", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    const pedidos: { id: string; folio: string }[] = [];
    for (let i = 0; i < 2; i++) {
      await agregarPorApi(page.request, volante(archivoId));
      pedidos.push((await (await page.request.post("/api/pedidos/borrador/confirmar")).json()).pedido);
    }

    await page.goto(`/panel/pedidos/${pedidos[0].id}`);
    await page.getByRole("button", { name: "Cancelar pedido" }).click();
    await expect(page.getByText(`¿Cancelar el pedido ${pedidos[0].folio}?`)).toBeVisible();
    await page.getByRole("button", { name: "Sí, cancelar pedido" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(pedidos[0].folio) })).toContainText("Cancelado");
    await expect(page.getByRole("button", { name: "Cancelar pedido" })).toHaveCount(0);

    const orders = await leerOrders();
    orders.pedidos.find((p) => p.id === pedidos[1].id)!.estado = "en_proceso";
    await escribirOrders(orders);
    await page.goto(`/panel/pedidos/${pedidos[1].id}`);
    await expect(page.getByRole("heading", { name: new RegExp(pedidos[1].folio) })).toContainText("En proceso");
    await expect(page.getByRole("button", { name: "Cancelar pedido" })).toHaveCount(0);
    expect((await page.request.post(`/api/pedidos/${pedidos[1].id}/cancelar`)).status()).toBe(409);
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en la lista, el borrador, el editor y el detalle", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "perro.png");
    await agregarPorApi(page.request, volante(archivoId, { descripcion: "Texto largo ".repeat(30) }));
    const { pedido } = await (await page.request.post("/api/pedidos/borrador/confirmar")).json();
    await agregarPorApi(page.request, volante(archivoId));

    for (const [url, texto] of [
      ["/panel/pedidos", pedido.folio],
      ["/panel/pedidos/nuevo", "perro.png"],
      ["/panel/pedidos/nuevo/item", "Presupuesto"],
      [`/panel/pedidos/${pedido.id}`, "Pago pendiente"],
    ]) {
      await page.goto(url);
      await expect(page.getByText(texto).first()).toBeVisible();
      await sinScrollHorizontal(page);
    }
  });
});
