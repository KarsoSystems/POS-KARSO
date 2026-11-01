import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y catálogo temporales antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/borrador-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.CATALOGO_PATH = `${base}/catalogo.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return {
    base,
    dataDir: process.env.DATA_DIR,
    uploadsDir: process.env.UPLOADS_DIR,
    catalogoPath: process.env.CATALOGO_PATH,
  };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as subir } from "@/app/api/archivos/route";
import { GET as getBorrador } from "./borrador/route";
import { POST as agregar } from "./borrador/items/route";
import { DELETE as quitar, PUT as editar } from "./borrador/items/[itemId]/route";
import { CATALOGO_PATH } from "@/server/catalogo";
import { jar } from "@/test/next-headers-mock";
import { iniciarSesionActiva } from "@/test/sesion";

const json = (method: string, body: unknown) =>
  new Request("http://localhost/api/pedidos/borrador/items", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const itemCtx = (itemId: string) => ({ params: Promise.resolve({ itemId }) });

async function subirArchivo(nombre = "volante.jpg"): Promise<string> {
  const form = new FormData();
  form.append("archivo", new File(["imagen"], nombre));
  const res = await subir(new Request("http://localhost/api/archivos", { method: "POST", body: form }));
  return (await res.json()).archivo.id;
}

const volante = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivoId,
  productoId: "volante",
  tamano: { tipo: "predefinido", tamanoId: "media-carta" },
  papelId: "couche-150",
  hojaId: "tabloide",
  cantidad: 1000,
  ...cambios,
});

const readJson = async (file: string) => JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));
const enUploads = async () => readdir(env.uploadsDir).catch(() => []);

interface CatalogoEditable {
  papeles: { precioHojaCentavos: Record<string, number> }[];
  productos: { papelesIds: string[] }[];
}

async function editarCatalogo(cambiar: (catalogo: CatalogoEditable) => void) {
  const catalogo = JSON.parse(await readFile(env.catalogoPath, "utf8"));
  cambiar(catalogo);
  await writeFile(env.catalogoPath, JSON.stringify(catalogo));
}

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(CATALOGO_PATH, env.catalogoPath);
  jar.clear();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("GET /api/pedidos/borrador", () => {
  it("sin sesión → 401", async () => {
    expect((await getBorrador()).status).toBe(401);
  });

  it("crea el borrador vacío la primera vez y devuelve el mismo después", async () => {
    await iniciarSesionActiva();
    const primero = (await (await getBorrador()).json()).pedido;
    expect(primero).toMatchObject({
      estado: "borrador",
      folio: null,
      items: [],
      totales: { subtotalCentavos: 0, ivaCentavos: 0, totalCentavos: 0, tasaIva: 0.16 },
    });
    const segundo = (await (await getBorrador()).json()).pedido;
    expect(segundo.id).toBe(primero.id);
    expect((await readJson("orders.json")).pedidos).toHaveLength(1);
  });

  it("recalcula con el catálogo vigente y lo guarda en orders.json", async () => {
    await iniciarSesionActiva();
    await agregar(json("POST", volante(await subirArchivo())));
    await editarCatalogo((c) => {
      c.papeles[1].precioHojaCentavos.tabloide = 600;
    });

    const { pedido } = await (await getBorrador()).json();
    expect(pedido.items[0].presupuesto.subtotalCentavos).toBe(300_000);
    expect(pedido.totales).toMatchObject({ subtotalCentavos: 300_000, ivaCentavos: 48_000 });
    expect((await readJson("orders.json")).pedidos[0].totales.subtotalCentavos).toBe(300_000);
  });

  it("marca problema si el catálogo deja de tener el papel o el producto", async () => {
    await iniciarSesionActiva();
    await agregar(json("POST", volante(await subirArchivo())));

    await editarCatalogo((c) => {
      c.productos[0].papelesIds = ["bond-90"];
      c.productos[1].papelesIds = ["couche-300"];
      c.papeles.splice(1, 1); // sin couché 150
    });
    let { pedido } = await (await getBorrador()).json();
    expect(pedido.items[0].problema).toBe("El papel ya no existe en el catálogo");
    // Conserva el último presupuesto válido.
    expect(pedido.items[0].presupuesto.subtotalCentavos).toBe(250_000);

    await editarCatalogo((c) => {
      c.productos.splice(0, 1); // sin volante
    });
    ({ pedido } = await (await getBorrador()).json());
    expect(pedido.items[0].problema).toBe("El producto ya no existe en el catálogo");
  });

  it("con un catálogo inválido responde 500 y el log indica el campo", async () => {
    await iniciarSesionActiva();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await editarCatalogo((c) => {
      c.productos[0].papelesIds.push("fantasma");
    });
    const res = await getBorrador();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("CATALOGO_INVALIDO");
    expect(errorSpy.mock.calls[0].join(" ")).toMatch(/productos\.0\.papelesIds\.2/);
    errorSpy.mockRestore();
  });
});

describe("POST /api/pedidos/borrador/items", () => {
  it("un ítem válido → 201 con presupuesto calculado en el servidor, también en orders.json", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo("perro.png");
    const res = await agregar(json("POST", { ...volante(archivoId), presupuesto: { hojas: 1 } }));
    expect(res.status).toBe(201);

    const { pedido, archivos } = await res.json();
    expect(pedido.items).toHaveLength(1);
    expect(pedido.items[0]).toMatchObject({
      archivoId,
      descripcion: "",
      anchoCm: 14,
      altoCm: 21.6,
      problema: null,
      presupuesto: {
        acomodo: { piezasPorHoja: 2, columnas: 1, filas: 2, rotada: true },
        hojas: 500,
        precioHojaCentavos: 500,
        subtotalCentavos: 250_000,
      },
    });
    expect(pedido.totales).toEqual({
      subtotalCentavos: 250_000,
      ivaCentavos: 40_000,
      totalCentavos: 290_000,
      tasaIva: 0.16,
    });
    expect(archivos[archivoId]).toMatchObject({ nombreOriginal: "perro.png", previsualizable: true });
    expect((await readJson("orders.json")).pedidos[0].items[0].presupuesto.subtotalCentavos).toBe(250_000);
  });

  it("un cartel tabloide en hoja tabloide → 422 NO_CABE con la hoja alternativa", async () => {
    await iniciarSesionActiva();
    const res = await agregar(
      json("POST", {
        archivoId: await subirArchivo(),
        productoId: "cartel",
        tamano: { tipo: "predefinido", tamanoId: "tabloide" },
        papelId: "couche-300",
        hojaId: "tabloide",
        cantidad: 10,
      }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toEqual({
      code: "NO_CABE",
      message: "No cabe en Tabloide; sí cabe en Mesa",
      fields: { hojaId: "No cabe en Tabloide; sí cabe en Mesa" },
    });
    expect((await readJson("orders.json").catch(() => ({ pedidos: [] }))).pedidos).toEqual([]);
  });

  it("un papel no permitido para el producto → 422", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", volante(await subirArchivo(), { papelId: "couche-300" })));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({
      papelId: "El papel Couché 300 g no está disponible para Volante",
    });
  });

  it("un tamaño predefinido que no es del producto → 422", async () => {
    await iniciarSesionActiva();
    const res = await agregar(
      json("POST", volante(await subirArchivo(), { tamano: { tipo: "predefinido", tamanoId: "estandar" } })),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toHaveProperty("tamano");
  });

  it("una cantidad fuera de rango → 422 de validación", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", volante(await subirArchivo(), { cantidad: 100_001 })));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ cantidad: "La cantidad máxima es 100,000" });
  });

  it("un archivo de otro usuario → 422", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const ajeno = await subirArchivo();
    await iniciarSesionActiva("beto@ejemplo.com");
    const res = await agregar(json("POST", volante(ajeno)));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ archivoId: "El archivo no existe" });
  });

  it("el ítem 21 → 409 'Máximo 20 ítems por pedido'", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    for (let i = 0; i < 20; i++) {
      expect((await agregar(json("POST", volante(archivoId)))).status).toBe(201);
    }
    const res = await agregar(json("POST", volante(archivoId)));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "MAXIMO_ITEMS",
      message: "Máximo 20 ítems por pedido",
    });
    expect((await readJson("orders.json")).pedidos[0].items).toHaveLength(20);
  });
});

describe("PUT /api/pedidos/borrador/items/:itemId", () => {
  it("cambiar hoja y cantidad recalcula el presupuesto", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const { pedido } = await (await agregar(json("POST", volante(archivoId)))).json();
    const itemId = pedido.items[0].id;

    const res = await editar(json("PUT", volante(archivoId, { hojaId: "mesa", cantidad: 1001 })), itemCtx(itemId));
    expect(res.status).toBe(200);
    const editado = (await res.json()).pedido;
    expect(editado.items).toHaveLength(1);
    expect(editado.items[0]).toMatchObject({
      id: itemId,
      hojaId: "mesa",
      cantidad: 1001,
      presupuesto: { hojas: 251, precioHojaCentavos: 650, subtotalCentavos: 163_150 },
    });
  });

  it("un ítem inexistente → 404", async () => {
    await iniciarSesionActiva();
    const res = await editar(json("PUT", volante(await subirArchivo())), itemCtx("no-existe"));
    expect(res.status).toBe(404);
  });

  it("si no cabe → 422 y el ítem queda igual", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const { pedido } = await (await agregar(json("POST", volante(archivoId)))).json();
    const res = await editar(
      json("PUT", volante(archivoId, { tamano: { tipo: "personalizado", anchoCm: 40, altoCm: 50 } })),
      itemCtx(pedido.items[0].id),
    );
    expect(res.status).toBe(422);
    expect((await readJson("orders.json")).pedidos[0].items[0].anchoCm).toBe(14);
  });

  it("cambiar el archivo libera el anterior si nadie más lo usa", async () => {
    await iniciarSesionActiva();
    const viejo = await subirArchivo("viejo.jpg");
    const nuevo = await subirArchivo("nuevo.jpg");
    const { pedido } = await (await agregar(json("POST", volante(viejo)))).json();

    await editar(json("PUT", volante(nuevo)), itemCtx(pedido.items[0].id));
    expect(await enUploads()).toEqual([`${nuevo}.jpg`]);
  });
});

describe("DELETE /api/pedidos/borrador/items/:itemId", () => {
  it("quita el ítem y borra su archivo de uploads/ y de archivos.json", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const { pedido } = await (await agregar(json("POST", volante(archivoId)))).json();
    expect(await enUploads()).toEqual([`${archivoId}.jpg`]);

    const res = await quitar(new Request("http://localhost"), itemCtx(pedido.items[0].id));
    expect(res.status).toBe(200);
    const { pedido: actualizado } = await res.json();
    expect(actualizado.items).toEqual([]);
    expect(actualizado.totales.totalCentavos).toBe(0);
    expect(await enUploads()).toEqual([]);
    expect((await readJson("archivos.json")).archivos).toEqual([]);
  });

  it("no borra el archivo si otro ítem lo usa", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    await agregar(json("POST", volante(archivoId)));
    const { pedido } = await (await agregar(json("POST", volante(archivoId, { hojaId: "mesa" })))).json();

    await quitar(new Request("http://localhost"), itemCtx(pedido.items[0].id));
    expect(await enUploads()).toEqual([`${archivoId}.jpg`]);
  });

  it("un ítem inexistente → 404", async () => {
    await iniciarSesionActiva();
    expect((await quitar(new Request("http://localhost"), itemCtx("no-existe"))).status).toBe(404);
  });
});
