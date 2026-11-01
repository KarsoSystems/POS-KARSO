import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y catálogo temporales antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/pedidos-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.CATALOGO_PATH = `${base}/catalogo.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return {
    base,
    dataDir: process.env.DATA_DIR,
    catalogoPath: process.env.CATALOGO_PATH,
  };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as subir } from "@/app/api/archivos/route";
import { POST as cancelar } from "./[id]/cancelar/route";
import { GET as detalle } from "./[id]/route";
import { POST as confirmar } from "./borrador/confirmar/route";
import { POST as agregar } from "./borrador/items/route";
import { GET as getBorrador } from "./borrador/route";
import { GET as listar } from "./route";
import { CATALOGO_PATH } from "@/server/catalogo";
import { jar } from "@/test/next-headers-mock";
import { cambiarSesion, iniciarSesionActiva } from "@/test/sesion";

interface CatalogoEditable {
  papeles: { id: string; precioHojaCentavos: Record<string, number> }[];
  productos: { papelesIds: string[] }[];
}

async function editarCatalogo(cambiar: (catalogo: CatalogoEditable) => void) {
  const catalogo = JSON.parse(await readFile(env.catalogoPath, "utf8"));
  cambiar(catalogo);
  await writeFile(env.catalogoPath, JSON.stringify(catalogo));
}

const ordersPath = () => path.join(env.dataDir, "orders.json");
const readOrders = async () => JSON.parse(await readFile(ordersPath(), "utf8"));

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const getDetalle = (id: string) => detalle(new Request("http://localhost"), idCtx(id));
const postCancelar = (id: string) => cancelar(new Request("http://localhost", { method: "POST" }), idCtx(id));

/** Sube un archivo y agrega 1,000 volantes media carta couché 150 en tabloide ($2,500.00). */
async function agregarVolante() {
  const form = new FormData();
  form.append("archivo", new File(["imagen"], "volante.jpg"));
  const subida = await subir(new Request("http://localhost/api/archivos", { method: "POST", body: form }));
  const archivoId = (await subida.json()).archivo.id;
  const res = await agregar(
    new Request("http://localhost/api/pedidos/borrador/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        archivoId,
        productoId: "volante",
        tamano: { tipo: "predefinido", tamanoId: "media-carta" },
        papelId: "couche-150",
        hojaId: "tabloide",
        cantidad: 1000,
      }),
    }),
  );
  expect(res.status).toBe(201);
}

async function confirmarUnPedido() {
  await agregarVolante();
  const res = await confirmar();
  expect(res.status).toBe(201);
  return (await res.json()).pedido;
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

describe("POST /api/pedidos/borrador/confirmar", () => {
  it("sin sesión → 401", async () => {
    expect((await confirmar()).status).toBe(401);
  });

  it("sin borrador → 422 PEDIDO_VACIO", async () => {
    await iniciarSesionActiva();
    const res = await confirmar();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toEqual({
      code: "PEDIDO_VACIO",
      message: "No has agregado nada a tu pedido",
    });
  });

  it("con un borrador de 0 ítems → 422 PEDIDO_VACIO y no gasta folio", async () => {
    await iniciarSesionActiva();
    await getBorrador();
    const res = await confirmar();
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("PEDIDO_VACIO");
    expect(await readOrders()).toMatchObject({ ultimoFolio: 0, pedidos: [{ estado: "borrador" }] });
  });

  it("asigna P-000001, pasa a pedido con pago pendiente y totales del borrador", async () => {
    await iniciarSesionActiva();
    const pedido = await confirmarUnPedido();
    expect(pedido).toMatchObject({
      folio: "P-000001",
      estado: "pedido",
      pago: { estado: "pendiente" },
      totales: { subtotalCentavos: 250_000, ivaCentavos: 40_000, totalCentavos: 290_000 },
    });
    expect(pedido.confirmadoAt).not.toBeNull();
  });

  it("folios consecutivos entre usuarios", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    expect((await confirmarUnPedido()).folio).toBe("P-000001");
    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await confirmarUnPedido()).folio).toBe("P-000002");
  });

  it("después de confirmar, GET borrador da uno nuevo vacío", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    const { pedido } = await (await getBorrador()).json();
    expect(pedido.id).not.toBe(confirmado.id);
    expect(pedido).toMatchObject({ estado: "borrador", items: [], folio: null });
  });

  it("un ítem con problema → 409 ITEMS_CON_PROBLEMAS y sigue en borrador", async () => {
    await iniciarSesionActiva();
    await agregarVolante();
    await editarCatalogo((c) => {
      c.productos[0].papelesIds = ["bond-90"]; // el volante ya no permite couché 150
    });
    const res = await confirmar();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ITEMS_CON_PROBLEMAS");
    expect(await readOrders()).toMatchObject({ ultimoFolio: 0, pedidos: [{ estado: "borrador" }] });
  });

  it("confirma con los precios vigentes al momento de confirmar", async () => {
    await iniciarSesionActiva();
    await agregarVolante();
    await editarCatalogo((c) => {
      c.papeles.find((p) => p.id === "couche-150")!.precioHojaCentavos.tabloide = 600;
    });
    const pedido = (await (await confirmar()).json()).pedido;
    expect(pedido.totales.subtotalCentavos).toBe(300_000);
  });

  it("los totales quedan congelados: cambiar el catálogo después no los altera", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    await editarCatalogo((c) => {
      c.papeles.find((p) => p.id === "couche-150")!.precioHojaCentavos.tabloide = 999;
    });

    const { pedido } = await (await getDetalle(confirmado.id)).json();
    expect(pedido.totales).toEqual(confirmado.totales);
    expect(pedido.items[0].presupuesto.precioHojaCentavos).toBe(500);
    const lista = (await (await listar()).json()).pedidos;
    expect(lista[0].totales.totalCentavos).toBe(290_000);
  });
});

describe("GET /api/pedidos", () => {
  it("sin pedidos devuelve una lista vacía (el borrador no cuenta)", async () => {
    await iniciarSesionActiva();
    await agregarVolante();
    expect((await (await listar()).json()).pedidos).toEqual([]);
  });

  it("lista solo los del usuario, recientes primero", async () => {
    const ana = await iniciarSesionActiva("ana@ejemplo.com");
    const primero = await confirmarUnPedido();
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await confirmarUnPedido();
    await agregarVolante(); // borrador actual: no aparece

    await iniciarSesionActiva("beto@ejemplo.com");
    await confirmarUnPedido();

    await cambiarSesion(ana);
    const folios = (await (await listar()).json()).pedidos.map((p: { folio: string }) => p.folio);
    expect(folios).toEqual([segundo.folio, primero.folio]);
  });
});

describe("GET /api/pedidos/:id", () => {
  it("el dueño ve el detalle con sus archivos", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    const res = await getDetalle(confirmado.id);
    expect(res.status).toBe(200);
    const { pedido, archivos } = await res.json();
    expect(pedido.folio).toBe("P-000001");
    expect(archivos[pedido.items[0].archivoId].nombreOriginal).toBe("volante.jpg");
  });

  it("el pedido de otro usuario → 404", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const ajeno = await confirmarUnPedido();
    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await getDetalle(ajeno.id)).status).toBe(404);
  });

  it("el borrador o un id inexistente → 404", async () => {
    await iniciarSesionActiva();
    const { pedido } = await (await getBorrador()).json();
    expect((await getDetalle(pedido.id)).status).toBe(404);
    expect((await getDetalle("no-existe")).status).toBe(404);
  });
});

describe("POST /api/pedidos/:id/cancelar", () => {
  it("en estado pedido → cancelado con canceladoAt", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    const res = await postCancelar(confirmado.id);
    expect(res.status).toBe(200);
    const { pedido } = await res.json();
    expect(pedido.estado).toBe("cancelado");
    expect(pedido.canceladoAt).not.toBeNull();
    expect(pedido.totales).toEqual(confirmado.totales);
  });

  it("en en_proceso (editado a mano en el JSON) → 409", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    const orders = await readOrders();
    orders.pedidos.find((p: { id: string }) => p.id === confirmado.id).estado = "en_proceso";
    await writeFile(ordersPath(), JSON.stringify(orders));

    const res = await postCancelar(confirmado.id);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ESTADO_INVALIDO");
    expect((await readOrders()).pedidos.find((p: { id: string }) => p.id === confirmado.id).estado).toBe(
      "en_proceso",
    );
  });

  it("ya cancelado → 409", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    await postCancelar(confirmado.id);
    expect((await postCancelar(confirmado.id)).status).toBe(409);
  });

  it("el pedido de otro usuario → 404 y no cambia", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const ajeno = await confirmarUnPedido();
    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await postCancelar(ajeno.id)).status).toBe(404);
    expect((await readOrders()).pedidos.find((p: { id: string }) => p.id === ajeno.id).estado).toBe("pedido");
  });

  it("el borrador no se cancela → 404", async () => {
    await iniciarSesionActiva();
    const { pedido } = await (await getBorrador()).json();
    expect((await postCancelar(pedido.id)).status).toBe(404);
  });
});
