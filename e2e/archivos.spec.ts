import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { crearCuentaActiva, sinScrollHorizontal } from "./helpers";
import {
  agregarPorApi,
  caras,
  editarProductos,
  enUploads,
  escribirOrders,
  fixture,
  ID,
  leerOrders,
  lona,
  opcion,
  confirmarPorApi,
  restaurarMock,
  siguienteFolio,
  subirEnEditor,
  subirPorApi,
  tarjeta,
} from "./pedidos-helpers";
import { DATA_DIR, E2E_AUTH_SECRET } from "./rutas";

// Archivos de la línea (SPEC 05): subida en tres pasos, validación que solo
// advierte, reverso según caras.reverso y copia a pedidos/<folio>/ al hacer el pedido.

test.afterEach(restaurarMock);

const ADVERTENCIA = "Tu archivo podría ser rechazado al revisarlo en sucursal";
const anioActual = () =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()));

/** Las advertencias (motivos) que muestra la página. */
const motivos = (page: Page) => page.locator("[data-slot=alert-description] li");

/** Espera a que todas las miniaturas carguen y devuelve cuántas se dibujaron. */
async function miniaturasCargadas(page: Page): Promise<number> {
  const imgs = page.locator('img[src*="/miniatura"]');
  await expect(imgs.first()).toBeVisible();
  await page.waitForFunction(() =>
    [...document.images].filter((i) => i.src.includes("/miniatura")).every((i) => i.complete && i.naturalWidth > 0),
  );
  return imgs.count();
}

async function editorTarjeta(page: Page, presentacion = "Couché") {
  await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.tarjeta}`);
  await opcion(page, presentacion).click();
  await page.getByLabel(/^Cantidad/).fill("1");
}

test.describe("Subida en tres pasos", () => {
  test("JPG CMYK: pide la URL, PUT a /api/r2-local/temporal/<id>.jpg y confirma; la zona muestra sus datos", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    const peticiones: string[] = [];
    page.on("request", (r) => {
      const { pathname } = new URL(r.url());
      if (/\/api\/(archivos|r2-local)/.test(pathname)) peticiones.push(`${r.method()} ${pathname}`);
    });
    await editorTarjeta(page);
    const confirmada = page.waitForResponse((r) => r.url().endsWith("/confirmar"));
    await subirEnEditor(page, "frente", "tarjeta-cmyk.jpg");

    const { archivo } = await (await confirmada).json();
    expect(archivo).toMatchObject({
      estado: "subido",
      miniatura: true,
      metadatos: { color: "CMYK", anchoPx: 1098, altoPx: 661 },
    });
    expect(peticiones.slice(0, 3)).toEqual([
      "POST /api/archivos/subidas",
      `PUT /api/r2-local/temporal/${archivo.id}.jpg`,
      `POST /api/archivos/${archivo.id}/confirmar`,
    ]);
    await expect(page.getByText("JPG · CMYK · 1098 × 661 px · 11 KB")).toBeVisible();
    await expect(page.getByText(ADVERTENCIA)).toHaveCount(0);
  });

  test("la barra de progreso aparece durante el PUT y 'Cancelar' lo aborta sin confirmar", async ({ page }) => {
    await crearCuentaActiva(page.request);
    // El PUT se retiene hasta el final del test para poder cancelarlo a medias.
    let soltar: () => void = () => {};
    const retenido = new Promise<void>((resolve) => (soltar = resolve));
    await page.route("**/api/r2-local/**", async (route) => {
      await retenido;
      await route.continue().catch(() => {});
    });
    let confirmo = false;
    page.on("request", (r) => {
      if (r.url().endsWith("/confirmar")) confirmo = true;
    });

    await editorTarjeta(page);
    await page.getByLabel("Archivo del frente").setInputFiles(fixture("tarjeta-cmyk.jpg"));
    const barra = page.getByRole("progressbar", { name: "Avance de la subida" });
    await expect(barra).toBeVisible();
    await expect(page.getByText("Subiendo tarjeta-cmyk.jpg…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Subiendo archivo…" })).toBeDisabled();

    await page.getByRole("button", { name: "Cancelar subida" }).click();
    await expect(barra).toBeHidden();
    await expect(page.getByText("Arrastra tu archivo aquí o haz clic para elegirlo")).toBeVisible();
    soltar();
    expect(confirmo).toBe(false);
  });

  test("acepta JPG, TIFF, PDF y AI; PNG, PSD y > 40 MB se rechazan sin subir y la API responde 415 y 413", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await editorTarjeta(page);
    for (const nombre of ["tarjeta-cmyk.jpg", "tarjeta-cmyk.tiff", "diseno.pdf", "vector.ai"]) {
      await subirEnEditor(page, "frente", nombre);
    }

    const pedidas: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/archivos/subidas")) pedidas.push(r.url());
    });
    const archivo = page.getByLabel("Archivo del frente");
    for (const nombre of ["perro.png", "capas.psd", "programa.exe"]) {
      await archivo.setInputFiles(fixture(nombre));
      await expect(page.getByText("Formato no permitido")).toBeVisible();
    }
    // Playwright no acepta buffers > 50 MB: se escribe a un archivo temporal.
    const enorme = test.info().outputPath("enorme.jpg");
    await writeFile(enorme, Buffer.alloc(41_943_040 + 1));
    await archivo.setInputFiles(enorme);
    await expect(page.getByText("El archivo supera 40 MB")).toBeVisible();
    expect(pedidas).toEqual([]);

    // También el servidor los rechaza aunque no pasen por el front.
    for (const nombre of ["perro.png", "capas.psd"]) {
      const res = await page.request.post("/api/archivos/subidas", { data: { nombre, bytes: 10 } });
      expect(res.status()).toBe(415);
      expect((await res.json()).error.message).toBe("Formato no permitido");
    }
    const grande = await page.request.post("/api/archivos/subidas", { data: { nombre: "lona.tiff", bytes: 41 * 1024 * 1024 } });
    expect(grande.status()).toBe(413);
    expect((await grande.json()).error.message).toBe("El archivo supera 40 MB");
    expect((await page.request.post("/api/archivos", { data: {} })).status()).toBe(404); // retirado
  });

  test("PUT con la firma alterada, vencida o a otra llave → 403; con más bytes que los declarados → 413", async ({
    page,
    playwright,
    baseURL,
  }) => {
    await crearCuentaActiva(page.request);
    const pedir = async (nombre: string, bytes: number) =>
      (await (await page.request.post("/api/archivos/subidas", { data: { nombre, bytes } })).json()).subida.url as string;
    // Sin cookies: la firma es lo único que autoriza el PUT.
    const anonimo = await playwright.request.newContext({ baseURL });

    const url = new URL(await pedir("a.pdf", 5));
    const alterada = new URL(url);
    alterada.searchParams.set("firma", "0".repeat(64));
    expect((await anonimo.put(alterada.toString(), { data: "12345" })).status()).toBe(403);

    const otra = new URL(url);
    otra.pathname = new URL(await pedir("b.pdf", 5)).pathname;
    expect((await anonimo.put(otra.toString(), { data: "12345" })).status()).toBe(403);

    // Vencida: bien firmada, con un vencimiento en el pasado.
    const key = decodeURIComponent(url.pathname.slice("/api/r2-local/".length));
    const expira = Date.now() - 1000;
    const firma = createHmac("sha256", E2E_AUTH_SECRET).update(`PUT\n${key}\n${expira}\n5`).digest("hex");
    const vencida = new URL(url);
    vencida.search = new URLSearchParams({ expira: String(expira), bytes: "5", firma }).toString();
    expect((await anonimo.put(vencida.toString(), { data: "12345" })).status()).toBe(403);

    expect((await anonimo.put(url.toString(), { data: "123456" })).status()).toBe(413);
    expect((await anonimo.put(url.toString(), { data: "12345" })).status()).toBe(200);
    await anonimo.dispose();
  });

  test("el original y la miniatura de otro usuario responden 404", async ({ page, playwright, baseURL }) => {
    await crearCuentaActiva(page.request);
    const archivoId = await subirPorApi(page.request, "tarjeta-cmyk.jpg");
    expect((await page.request.get(`/api/archivos/${archivoId}`)).status()).toBe(200);
    expect((await page.request.get(`/api/archivos/${archivoId}/miniatura`)).status()).toBe(200);

    const otro = await playwright.request.newContext({ baseURL });
    await crearCuentaActiva(otro);
    expect((await otro.get(`/api/archivos/${archivoId}`)).status()).toBe(404);
    expect((await otro.get(`/api/archivos/${archivoId}/miniatura`)).status()).toBe(404);
    await otro.dispose();
  });
});

test.describe("Validación (solo advierte)", () => {
  test("tarjeta couché: 1098 × 661, 2196 × 1322 y girado sin advertencias; RGB, baja resolución, medida y PDF advierten", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await editorTarjeta(page);

    for (const nombre of ["tarjeta-cmyk.jpg", "tarjeta-cmyk-600dpi.jpg", "tarjeta-cmyk-girada.jpg"]) {
      await subirEnEditor(page, "frente", nombre);
      await expect(page.getByText(ADVERTENCIA)).toHaveCount(0);
    }

    const casos: [string, string[]][] = [
      ["tarjeta-rgb.jpg", ["El archivo está en RGB; se requiere CMYK"]],
      ["tarjeta-baja-resolucion.jpg", ["Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)"]],
      [
        "tarjeta-medida-incorrecta.jpg",
        ["La medida no corresponde: a 9.3 cm de ancho el archivo mide 9.3 × 5.1 cm; se esperaba 9.3 × 5.6 cm (± 0.1 cm)"],
      ],
      ["diseno.pdf", ["Formato PDF no permitido para este producto; se aceptan JPG, JPEG y TIFF"]],
    ];
    for (const [nombre, esperados] of casos) {
      await subirEnEditor(page, "frente", nombre);
      await expect(page.getByText(ADVERTENCIA)).toBeVisible();
      await expect(motivos(page)).toHaveText(esperados);
    }
  });

  test("TIFF CMYK: miniatura generada en el editor y en el borrador", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await editorTarjeta(page);
    await subirEnEditor(page, "frente", "tarjeta-cmyk.tiff");
    await expect(page.getByText("TIFF · CMYK · 1098 × 661 px")).toBeVisible();
    expect(await miniaturasCargadas(page)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByRole("img", { name: "tarjeta-cmyk.tiff" })).toBeVisible();
    expect(await miniaturasCargadas(page)).toBe(1);
  });

  test("lona 2.00 × 1.50 m con 7874 × 5906 px sin advertencias; a 3.00 × 1.50 m aparece la de medida sin volver a subir", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.lona}`);
    await opcion(page, "720 dpi").click();
    await page.getByLabel("Ancho (m)").fill("2");
    await page.getByLabel("Alto (m)").fill("1.5");
    await subirEnEditor(page, "frente", "lona-cmyk.jpg");
    await expect(page.getByText("JPG · CMYK · 7874 × 5906 px")).toBeVisible();
    await expect(page.getByText(ADVERTENCIA)).toHaveCount(0);

    let subidas = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/archivos/subidas")) subidas++;
    });
    await page.getByLabel("Ancho (m)").fill("3");
    await expect(page.getByText(ADVERTENCIA)).toBeVisible();
    await expect(motivos(page).filter({ hasText: "La medida no corresponde" })).toHaveCount(1);
    expect(subidas).toBe(0);
  });

  test("cambiar colorRequerido a 'cualquiera' en el mock quita la advertencia de color del borrador al recargar", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await agregarPorApi(page.request, tarjeta(await subirPorApi(page.request, "tarjeta-rgb.jpg")));
    await page.goto("/panel/pedidos/nuevo");
    await expect(motivos(page)).toHaveText(["El archivo está en RGB; se requiere CMYK"]);
    await expect(page.getByText("Podría ser rechazado", { exact: true })).toBeVisible();

    await editarProductos((a) => {
      a.productos.find((p) => p._id === ID.tarjeta)!.archivo.colorRequerido = "cualquiera";
    });
    await page.reload();
    await expect(page.getByTestId("total-pedido")).toBeVisible();
    await expect(page.getByText(ADVERTENCIA)).toHaveCount(0);
    await expect(page.getByText("Podría ser rechazado", { exact: true })).toHaveCount(0);
  });
});

test.describe("Reverso según caras.reverso", () => {
  test("laminada (obligatorio): sin reverso no se guarda; con calendario sí y al editar precarga el año; luego texto", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await editorTarjeta(page, "Laminada");
    await subirEnEditor(page, "frente", "tarjeta-cmyk.jpg");
    const reverso = page.getByRole("radiogroup", { name: /Reverso/ });
    await expect(reverso.getByRole("radio")).toHaveText(["Mi archivo", "Calendario", "Texto"]);

    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page.getByText("Elige el reverso")).toBeVisible();
    await expect(page).toHaveURL(/\/item\?producto=/);

    await opcion(page, "Calendario").click();
    const anio = anioActual();
    await expect(page.getByRole("radiogroup", { name: "Año del calendario" }).getByRole("radio")).toHaveText([
      String(anio),
      String(anio + 1),
    ]);
    await opcion(page, String(anio + 1)).click();
    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByText(`Calendario ${anio + 1}`)).toBeVisible();

    await page.getByRole("link", { name: "Editar ítem" }).click();
    await expect(opcion(page, String(anio + 1))).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("tarjeta-cmyk.jpg", { exact: true }).first()).toBeVisible();
    await opcion(page, "Texto").click();
    await page.getByLabel("Texto del reverso").fill("Oración a San Judas Tadeo");
    await expect(page.getByText("25/500")).toBeVisible();
    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);
    await expect(page.getByText("Texto: “Oración a San Judas Tadeo”")).toBeVisible();

    await page.getByRole("link", { name: "Editar ítem" }).click();
    await expect(page.getByLabel("Texto del reverso")).toHaveValue("Oración a San Judas Tadeo");
  });

  test("API: laminada con archivo de reverso; couché sin reverso, archivo, calendarios y texto; otros años y 501 caracteres → 422", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    const frente = await subirPorApi(page.request, "tarjeta-cmyk.jpg");
    const atras = await subirPorApi(page.request, "tarjeta-cmyk-600dpi.jpg");
    const anio = anioActual();
    const agregar = (reverso: unknown, varianteId = ID.tarjetaCouche) =>
      page.request.post("/api/pedidos/borrador/items", {
        data: tarjeta(frente, { varianteId, archivos: caras(frente, reverso) }),
      });

    expect((await agregar(null, ID.tarjetaLaminada)).status()).toBe(422);
    expect((await agregar({ tipo: "archivo", archivoId: atras }, ID.tarjetaLaminada)).status()).toBe(201);
    for (const reverso of [
      null,
      { tipo: "archivo", archivoId: atras },
      { tipo: "calendario", anio },
      { tipo: "calendario", anio: anio + 1 },
      { tipo: "texto", texto: "a".repeat(500) },
    ]) {
      expect((await agregar(reverso)).status()).toBe(201);
    }
    for (const reverso of [
      { tipo: "calendario", anio: anio - 1 },
      { tipo: "calendario", anio: anio + 2 },
      { tipo: "texto", texto: "a".repeat(501) },
    ]) {
      expect((await agregar(reverso)).status()).toBe(422);
    }
  });

  test("volante bond (no_aplica): sin sección de reverso y la API rechaza un reverso con 422", async ({ page }) => {
    await crearCuentaActiva(page.request);
    await page.goto(`/panel/pedidos/nuevo/item?producto=${ID.volante}`);
    await opcion(page, "Bond 90 g 4x0").click();
    await opcion(page, "Carta").click();
    await expect(page.getByLabel("Archivo del frente")).toHaveCount(1);
    await expect(page.getByRole("radiogroup", { name: /Reverso/ })).toHaveCount(0);

    const res = await page.request.post("/api/pedidos/borrador/items", {
      data: {
        archivos: caras(await subirPorApi(page.request, "tarjeta-cmyk.jpg"), { tipo: "texto", texto: "Hola" }),
        productoId: ID.volante,
        varianteId: ID.volanteBond,
        cantidad: 1,
      },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error.fields).toEqual({ "archivos.reverso": "Este producto no lleva reverso" });
  });
});

test.describe("Hacer pedido con advertencias", () => {
  test("frente RGB y reverso de baja resolución: insignia en borrador y detalle, se confirma y los archivos pasan a pedidos/<folio>/", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    await editorTarjeta(page);
    await subirEnEditor(page, "frente", "tarjeta-rgb.jpg");
    await opcion(page, "Mi archivo").click();
    await subirEnEditor(page, "reverso", "tarjeta-baja-resolucion.jpg");
    // Cada cara con sus propias advertencias.
    await expect(motivos(page)).toHaveText([
      "El archivo está en RGB; se requiere CMYK",
      "Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)",
    ]);
    await page.getByRole("button", { name: "Guardar ítem" }).click();
    await expect(page).toHaveURL(/\/panel\/pedidos\/nuevo$/);

    await expect(page.getByText("Podría ser rechazado", { exact: true })).toBeVisible();
    await expect(motivos(page)).toHaveText([
      "Frente: El archivo está en RGB; se requiere CMYK",
      "Reverso: Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)",
    ]);

    // Editar precarga frente y reverso de archivo.
    await page.getByRole("link", { name: "Editar ítem" }).click();
    await expect(opcion(page, "Mi archivo")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("tarjeta-rgb.jpg", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("tarjeta-baja-resolucion.jpg", { exact: true })).toBeVisible();
    await page.goto("/panel/pedidos/nuevo");

    const folio = await siguienteFolio();
    await opcion(page, /KARSO Centro/).click();
    await expect(page.getByRole("button", { name: "Hacer pedido" })).toBeEnabled();
    await page.getByRole("button", { name: "Hacer pedido" }).click();
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText("Pago aprobado", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(folio) })).toBeVisible();
    await expect(page.getByText("Podría ser rechazado", { exact: true })).toBeVisible();
    expect(await miniaturasCargadas(page)).toBe(2);

    const pedido = (await leerOrders()).pedidos.find((p) => p.folio === folio)!;
    const { lineaId } = pedido.productos[0];
    expect((await enUploads(`pedidos/${folio}`)).sort()).toEqual(
      [
        `${lineaId}_frente.jpg`,
        `${lineaId}_frente.jpg.miniatura.jpg`,
        `${lineaId}_reverso.jpg`,
        `${lineaId}_reverso.jpg.miniatura.jpg`,
      ].sort(),
    );
    // Los temporales de este usuario ya no existen (el detalle sirve las copias).
    const temporales = await enUploads();
    const { archivos } = await (await page.request.get(`/api/pedidos/${pedido.id}`)).json();
    for (const id of Object.keys(archivos)) expect(temporales.some((t) => t.startsWith(id))).toBe(false);
  });
});

test.describe("Datos de versiones anteriores", () => {
  test("un orders.json de versión 2 y un archivos.json de versión 1 se reemplazan por vacíos sin romper la app", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    const { contadores } = await leerOrders();
    await escribirOrders({ version: 2, ultimoFolio: 7, pedidos: [{ id: "viejo", estado: "borrador", productos: [] }] });
    await writeFile(`${DATA_DIR}/archivos.json`, JSON.stringify({ version: 1, archivos: [{ id: "viejo" }] }));

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Tu pedido está vacío")).toBeVisible();
    expect(await leerOrders()).toMatchObject({ version: 7 });
    expect((await page.request.get("/api/archivos/viejo")).status()).toBe(404);
    // Deja los contadores como estaban para que los folios de otros tests sigan la secuencia.
    await escribirOrders({ ...(await leerOrders()), contadores });
  });
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("sin scroll horizontal en el editor con frente, reverso y advertencias, en el borrador y en el detalle", async ({
    page,
  }) => {
    await crearCuentaActiva(page.request);
    const rgb = await subirPorApi(page.request, "tarjeta-rgb.jpg");
    const baja = await subirPorApi(page.request, "tarjeta-baja-resolucion.jpg");
    const { productos } = await agregarPorApi(
      page.request,
      tarjeta(rgb, { archivos: caras(rgb, { tipo: "archivo", archivoId: baja }) }),
    );
    await agregarPorApi(page.request, lona(await subirPorApi(page.request, "diseno.pdf")));

    await page.goto(`/panel/pedidos/nuevo/item/${productos[0].lineaId}`);
    await expect(motivos(page)).toHaveCount(2);
    await sinScrollHorizontal(page);

    await page.goto("/panel/pedidos/nuevo");
    await expect(page.getByText("Podría ser rechazado", { exact: true }).first()).toBeVisible();
    await sinScrollHorizontal(page);

    const pedido = await confirmarPorApi(page.request);
    await page.goto(`/panel/pedidos/${pedido.id}`);
    await expect(page.getByRole("heading", { name: new RegExp(pedido.folio) })).toContainText("Pago pendiente");
    await sinScrollHorizontal(page);
  });
});
