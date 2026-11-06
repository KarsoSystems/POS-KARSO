import { expect, test } from "@playwright/test";
import { crearCuentaActiva, datosRegistro, PASSWORD, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  editarProductos,
  enUploads,
  escribirOrders,
  ID,
  leerOrders,
  llenarTarjeta,
  lona,
  opcion,
  restaurarMock,
  subirEnEditor,
  subirPorApi,
  tarjeta,
  varianteDe,
} from "./pedidos-helpers";

// Varios tests editan el mock del panel: siempre se deja como el de git.
test.afterEach(restaurarMock);

const folio = (n: number) => `P-${String(n).padStart(6, "0")}`;

test.describe("Catálogo de la tienda", () => {
  test("/api/tienda/productos responde sin sesión, sin la lona urgente; un mock inválido → 500; /api/catalogo ya no existe", async ({
    request,
  }) => {
    const res = await request.get("/api/tienda/productos");
    expect(res.status()).toBe(200);
    const { productos } = await res.json();
    const skusLona = productos.find((p: { _id: string }) => p._id === ID.lona).variantes.map((v: { sku: string }) => v.sku);
    expect(skusLona).toEqual(["70000178", "70000181"]);
    expect((await request.get("/api/tienda/banners")).status()).toBe(200);
    expect((await request.get("/api/catalogo")).status()).toBe(404);

    await editarProductos((a) => {
      a.productos[0].variantes[1].sku = a.productos[0].variantes[0].sku;
    });
    const invalido = await request.get("/api/tienda/productos");
    expect(invalido.status()).toBe(500);
    expect((await invalido.json()).error.code).toBe("CATALOGO_INVALIDO");
  });
});

test.describe("Editor de línea", () => {
  test("tarjeta couché × 2 millares con suaje: $310.00 en vivo, en el borrador y en orders.json", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos/nuevo/item");
    await expect(page.getByText("Precios de ejemplo")).toBeVisible();
    await llenarTarjeta(page);

    await expect(page.getByTestId("precio-variante")).toHaveText("$115.00 por millar");
    await expect(page.getByText("2 millares (2,000 piezas)").first()).toBeVisible();
    await expect(page.getByTestId("medida-pieza")).toHaveText("8.7 × 5 cm · rebase 0.3 cm");
    const desglose = page.getByLabel("Cotización de la línea");
    await expect(desglose).toContainText("Base unitaria$115.00");
    await expect(desglose).toContainText("+ Suaje$40.00");
    await expect(desglose).toContainText("Importe unitario$155.00");
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$310.00");

    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$310.00");
    await expect(page.getByTestId("total-pedido")).toHaveText("$310.00");

    const { pedidos } = await leerOrders();
    const borrador = pedidos.find((p) => p.estado === "borrador" && p.productos.length === 1)!;
    expect(borrador.total).toBe(310);
  });

  test("lona 2.00 × 1.50 m × 2 con ojillos: 3.00 m², 14 ojillos, $414.00; con la tarjeta el borrador da $724.00 sin IVA", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "volante.jpg")));
    await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.lona}`);
    await expect(opcion(page, /^Lona 13 oz/)).toHaveAttribute("aria-checked", "true");
    await opcion(page, "720 dpi").click();
    await subirEnEditor(page, "frente", "lona-cmyk.jpg");
    await page.getByLabel("Ancho (m)").fill("2");
    await page.getByLabel("Alto (m)").fill("1.5");
    await page.getByLabel(/Ojillos/).check();
    await page.getByLabel(/^Cantidad/).fill("2");

    await expect(page.getByTestId("medida-pieza")).toHaveText("2.00 × 1.50 m · 3.00 m²");
    await expect(page.getByText("(14 × $3.00)")).toBeVisible();
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$414.00");

    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByTestId("subtotal-linea")).toHaveText(["$310.00", "$414.00"]);
    await expect(page.getByTestId("total-pedido")).toHaveText("$724.00");
    await expect(page.getByText("Precios sin IVA. Si requieres factura, se suma al pagar.")).toBeVisible();
    await expect(page.getByText(/IVA \(/)).toHaveCount(0);
  });

  test("Tríptico deja 'Ajustado' deshabilitado; con Bond solo Carta, Oficio, 4 cartas y 8 cartas", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.volante}`);
    await opcion(page, "Couché 128 g 4x4").click();
    await opcion(page, "Tríptico").click();
    const ajustado = page.getByRole("radio", { name: /^Ajustado/ });
    await expect(ajustado).toBeDisabled();
    await expect(ajustado).toContainText("No disponible para Tríptico");
    await expect(opcion(page, "Real")).toHaveAttribute("aria-checked", "true");

    await opcion(page, "Bond 90 g 4x0").click();
    const tamanos = page.getByRole("radiogroup", { name: "Tamaño" }).getByRole("radio");
    await expect(tamanos).toHaveCount(10);
    const habilitados = await tamanos.evaluateAll((els) =>
      els.filter((e) => !(e as HTMLButtonElement).disabled).map((e) => (e as HTMLElement).innerText.split("\n")[0]),
    );
    expect(habilitados).toEqual(["Carta", "Oficio", "4 cartas", "8 cartas"]);
  });

  test("medidas: fuera de rango no se guarda, la medida rápida llena, cobro mínimo de la lona e imán por metro lineal", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.lona}`);
    await opcion(page, "720 dpi").click();
    await page.getByLabel("Ancho (m)").fill("6");
    await page.getByLabel("Alto (m)").fill("1.5");
    await page.getByLabel(/^Cantidad/).fill("1");
    await expect(page.getByText("El ancho debe estar entre 0.50 y 5.00 m").first()).toBeVisible();
    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/item\?producto=/);
    expect((await (await page.request.get("/api/pedidos/borrador")).json()).pedido.productos).toEqual([]);

    await page.getByRole("button", { name: /Banner 1.60 × 0.60/ }).click();
    await expect(page.getByLabel("Ancho (m)")).toHaveValue("1.60");
    await expect(page.getByLabel("Alto (m)")).toHaveValue("0.60");

    await page.getByLabel("Ancho (m)").fill("0.5");
    await page.getByLabel("Alto (m)").fill("0.5");
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$100.00");

    await opcion(page, /^Imán/).click();
    await opcion(page, "Metro lineal").click();
    await expect(page.getByText("Ancho fijo:")).toContainText("0.56 m");
    await expect(page.getByLabel("Ancho (m)")).toHaveCount(0);
    await page.getByLabel("Largo (m)").fill("3");
    await page.getByLabel(/^Cantidad/).fill("1");
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$1,500.00");
  });

  test("acabados por variante y cantidad con su unidad", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.tarjeta}`);
    await opcion(page, "Credencial PVC").click();
    await expect(page.getByText("Este producto no lleva acabados adicionales.")).toBeVisible();
    await page.getByLabel(/^Cantidad/).fill("2");
    await expect(page.getByText("2 piezas", { exact: true })).toBeVisible();

    await opcion(page, /^Lona 13 oz/).click();
    await expect(page.getByText("Urgente (mismo día)")).toHaveCount(0);
    await opcion(page, "720 dpi").click();
    for (const texto of ["+$3.00 por ojillo (cada 50 cm)", "+$10.00 por metro lineal", "+$30.00 por pieza"]) {
      await expect(page.getByText(texto)).toBeVisible();
    }

    await opcion(page, /^Imán/).click();
    await opcion(page, "100 piezas").click();
    await page.getByLabel(/^Cantidad/).fill("3");
    await expect(page.getByText("3 paquetes de 100 (300 piezas)").first()).toBeVisible();
  });

  test("editar una línea precarga todo y la cotización se actualiza en vivo antes de guardar", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "tarjeta-cmyk.jpg");
    const { productos } = await agregarPorApi(page.request, lona(archivoId));

    await page.goto("/panel/pedidos/nuevo");
    await page.getByRole("link", { name: "Editar ítem" }).click();
    await expect(page).toHaveURL(new RegExp(`/item/${productos[0].lineaId}$`));
    await expect(opcion(page, /^Lona 13 oz/)).toHaveAttribute("aria-checked", "true");
    await expect(opcion(page, "720 dpi")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Ancho (m)")).toHaveValue("2.00");
    await expect(page.getByLabel("Alto (m)")).toHaveValue("1.50");
    await expect(page.getByLabel(/Ojillos/)).toBeChecked();
    await expect(page.getByLabel(/^Cantidad/)).toHaveValue("2");
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$414.00");

    await page.getByLabel(/Empalme/).check();
    await page.getByLabel(/^Cantidad/).fill("3");
    await expect(page.getByTestId("subtotal-linea")).toHaveText("$711.00"); // (165 + 42 + 30) × 3

    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByTestId("total-pedido")).toHaveText("$711.00");
  });
});

test.describe("Borrador", () => {
  test("miniatura (JPG generado por el servidor) para JPG e ícono con nombre para PDF", async ({ page }) => {
    await crearCuentaActiva(page.request);
    for (const nombre of ["volante.jpg", "diseno.pdf"]) {
      await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, nombre)));
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
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("tarjeta-cmyk.jpg").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("tarjeta-cmyk.jpg").first()).toBeVisible();

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
    await expect(page.getByText("tarjeta-cmyk.jpg").first()).toBeVisible();
    await expect(page.getByTestId("total-pedido")).toHaveText("$310.00");
  });

  test("quitar una línea pide confirmación y borra su archivo de uploads/", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "tarjeta-cmyk.jpg");
    await agregarPorApi(page.request, tarjeta(archivoId));
    expect(await enUploads()).toContain(`${archivoId}.jpg`);

    await page.goto("/panel/pedidos/nuevo");
    await page.getByRole("button", { name: "Quitar ítem" }).click();
    await expect(page.getByText("¿Quitar este ítem?")).toBeVisible();
    await expect(page.getByText("Se quitará Tarjeta (tarjeta-cmyk.jpg)")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Quitar ítem" }).click();
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();
    expect(await enUploads()).not.toContain(`${archivoId}.jpg`);
  });

  test("la línea 21 no se puede agregar: 'Máximo 20 ítems por pedido'", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "tarjeta-cmyk.jpg");
    for (let i = 0; i < 20; i++) await agregarPorApi(page.request, tarjeta(archivoId));

    const res = await page.request.post("/api/pedidos/borrador/items", { data: tarjeta(archivoId) });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.message).toBe("Máximo 20 ítems por pedido");

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Máximo 20 ítems por pedido")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar ítem" })).toBeDisabled();
  });

  test("'Hacer pedido' con 0 líneas muestra el aviso y la API responde 422", async ({ page }) => {
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

  test("si la variante se desactiva en el mock, la línea muestra el problema y 'Hacer pedido' se bloquea", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    await editarProductos((a) => {
      varianteDe(a, ID.tarjeta, ID.tarjetaCouche).activa = false;
    });

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText(/Couché 8\.7 x 5 cm ya no está disponible/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hacer pedido" })).toBeDisabled();

    const res = await page.request.post("/api/pedidos/borrador/confirmar");
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("ITEMS_CON_PROBLEMAS");
  });

  test("un orders.json de la SPEC 02 (versión 1) se reemplaza por uno vacío sin romper la app", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const { ultimoFolio } = await leerOrders();
    await escribirOrders({ version: 1, ultimoFolio: 7, pedidos: [{ id: "viejo", estado: "borrador", items: [], totales: {} }] });

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();
    expect(await leerOrders()).toMatchObject({ version: 3 });
    // Deja el contador como estaba para que los folios de otros tests sigan la secuencia.
    const actual = await leerOrders();
    await escribirOrders({ ...actual, ultimoFolio });
  });
});

test.describe("Hacer pedido, detalle y cancelar", () => {
  test("confirma con folio, pago pendiente y borrador nuevo vacío; aparece en Mis pedidos", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto("/panel/pedidos");
    await expect(page.getByText("Aún no tienes pedidos")).toBeVisible();

    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    const esperado = folio((await leerOrders()).ultimoFolio + 1);

    await page.goto("/panel/pedidos/nuevo");
    await page.getByRole("button", { name: "Hacer pedido" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/[\w-]+\?confirmado=1$/);
    await expect(page.getByText(`Pedido ${esperado} recibido`)).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(esperado) })).toContainText("Pedido");
    await expect(page.getByText("Pago pendiente")).toBeVisible();
    await expect(page.getByTestId("total-pedido")).toHaveText("$310.00");
    await expect(page.getByText("Tarjeta · Couché 8.7 x 5 cm")).toBeVisible();

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();

    await page.goto("/panel/pedidos");
    const fila = page.getByRole("link", { name: new RegExp(esperado) });
    await expect(fila).toContainText("Pedido");
    await expect(fila).toContainText("1 ítem");
    await expect(fila).toContainText("$310.00");
  });

  test("cambiar un precio en el mock no altera un pedido confirmado y sí recalcula el borrador", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
    const { pedido } = await (await page.request.post("/api/pedidos/borrador/confirmar")).json();
    // Al confirmar, el archivo temporal pasa al pedido: el borrador nuevo sube otro.
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));

    await editarProductos((a) => {
      varianteDe(a, ID.tarjeta, ID.tarjetaCouche).precio = 120;
    });

    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByTestId("total-pedido")).toHaveText("$310.00");
    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByTestId("total-pedido")).toHaveText("$320.00"); // (120 + 40) × 2
  });

  test("cancelar pasa a Cancelado; en_proceso no muestra el botón y la API responde 409", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const pedidos: { id: string; folio: string }[] = [];
    for (let i = 0; i < 2; i++) {
      await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));
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

  test("sin scroll horizontal en el inicio, la lista, el borrador, el editor y el detalle", async ({ page }) => {
    await crearCuentaActiva(page.request);
    const tarjetaId = await subirPorApi(page.request, "tarjeta-cmyk.jpg");
    await agregarPorApi(page.request, tarjeta(tarjetaId, { descripcion: "Texto largo ".repeat(30) }));
    const { pedido } = await (await page.request.post("/api/pedidos/borrador/confirmar")).json();
    await agregarPorApi(page.request, lona(await subirPorApi(page.request, "tarjeta-cmyk.jpg")));

    for (const [url, texto] of [
      ["/panel", "Hola"],
      ["/panel/pedidos", pedido.folio],
      ["/panel/pedidos/nuevo", "tarjeta-cmyk.jpg"],
      [`/panel/pedidos/nuevo/item?producto=${ID.volante}`, "Cotización"],
      [`/panel/pedidos/${pedido.id}`, "Pago pendiente"],
    ]) {
      await page.goto(url);
      await expect(page.getByText(texto).first()).toBeVisible();
      await sinScrollHorizontal(page);
    }
  });
});
