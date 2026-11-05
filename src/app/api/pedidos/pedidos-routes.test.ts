import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y mock del panel temporales antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/pedidos-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return {
    base,
    dataDir: process.env.DATA_DIR,
    productosPath: process.env.PRODUCTOS_PATH,
  };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as subir } from "@/app/api/archivos/route";
import type { ProductosArchivo } from "@/lib/catalogo/schema";
import { PRODUCTOS_PATH } from "@/server/mock-panel";
import { POST as cancelar } from "./[id]/cancelar/route";
import { GET as detalle } from "./[id]/route";
import { POST as confirmar } from "./borrador/confirmar/route";
import { POST as agregar } from "./borrador/items/route";
import { GET as getBorrador } from "./borrador/route";
import { GET as listar } from "./route";
import { jar } from "@/test/next-headers-mock";
import { cambiarSesion, iniciarSesionActiva } from "@/test/sesion";

const TARJETA = "6720a1f0c1a2b3c4d5e60201";
const TARJETA_COUCHE = "6720a1f0c1a2b3c4d5e60211";
const SUAJE = 2;

/** Cambia la tarjeta couché en la copia del mock del panel. */
async function editarTarjetaCouche(cambiar: (variante: ProductosArchivo["productos"][0]["variantes"][0]) => void) {
  const archivo: ProductosArchivo = JSON.parse(await readFile(env.productosPath, "utf8"));
  cambiar(archivo.productos.find((p) => p._id === TARJETA)!.variantes.find((v) => v.varianteId === TARJETA_COUCHE)!);
  await writeFile(env.productosPath, JSON.stringify(archivo));
}

const ordersPath = () => path.join(env.dataDir, "orders.json");
const readOrders = async () => JSON.parse(await readFile(ordersPath(), "utf8"));

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const getDetalle = (id: string) => detalle(new Request("http://localhost"), idCtx(id));
const postCancelar = (id: string) => cancelar(new Request("http://localhost", { method: "POST" }), idCtx(id));

/** Sube un archivo y agrega 2 millares de tarjeta couché con suaje ($310.00). */
async function agregarTarjeta() {
  const form = new FormData();
  form.append("archivo", new File(["imagen"], "tarjeta.jpg"));
  const subida = await subir(new Request("http://localhost/api/archivos", { method: "POST", body: form }));
  const archivoId = (await subida.json()).archivo.id;
  const res = await agregar(
    new Request("http://localhost/api/pedidos/borrador/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        archivoId,
        productoId: TARJETA,
        varianteId: TARJETA_COUCHE,
        especificaciones: [SUAJE],
        cantidad: 2,
      }),
    }),
  );
  expect(res.status).toBe(201);
}

async function confirmarUnPedido() {
  await agregarTarjeta();
  const res = await confirmar();
  expect(res.status).toBe(201);
  return (await res.json()).pedido;
}

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, env.productosPath);
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

  it("con un borrador de 0 líneas → 422 PEDIDO_VACIO y no gasta folio", async () => {
    await iniciarSesionActiva();
    await getBorrador();
    const res = await confirmar();
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("PEDIDO_VACIO");
    expect(await readOrders()).toMatchObject({ ultimoFolio: 0, pedidos: [{ estado: "borrador" }] });
  });

  it("asigna P-000001, pasa a pedido con pago pendiente y totales del borrador (sin IVA)", async () => {
    await iniciarSesionActiva();
    const pedido = await confirmarUnPedido();
    expect(pedido).toMatchObject({
      folio: "P-000001",
      estado: "pedido",
      pago: { estado: "pendiente" },
      subtotal: 310,
      tasaIva: 0,
      iva: 0,
      total: 310,
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
    expect(pedido).toMatchObject({ estado: "borrador", productos: [], folio: null });
  });

  it("una línea con problema → 409 ITEMS_CON_PROBLEMAS y sigue en borrador", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    await editarTarjetaCouche((v) => {
      v.activa = false;
    });
    const res = await confirmar();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ITEMS_CON_PROBLEMAS");
    expect(await readOrders()).toMatchObject({ ultimoFolio: 0, pedidos: [{ estado: "borrador" }] });
  });

  it("confirma con los precios vigentes al momento de confirmar", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    await editarTarjetaCouche((v) => {
      v.precio = 120;
    });
    const pedido = (await (await confirmar()).json()).pedido;
    expect(pedido.total).toBe(320);
  });

  it("los totales quedan congelados: cambiar el catálogo después no los altera", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    await editarTarjetaCouche((v) => {
      v.precio = 999;
      v.activa = false;
    });

    const { pedido } = await (await getDetalle(confirmado.id)).json();
    expect(pedido.total).toBe(confirmado.total);
    expect(pedido.productos[0]).toMatchObject({ precioBase: 115, subtotal: 310, problema: null });
    const lista = (await (await listar()).json()).pedidos;
    expect(lista[0].total).toBe(310);
  });
});

describe("GET /api/pedidos", () => {
  it("sin pedidos devuelve una lista vacía (el borrador no cuenta)", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    expect((await (await listar()).json()).pedidos).toEqual([]);
  });

  it("lista solo los del usuario, recientes primero", async () => {
    const ana = await iniciarSesionActiva("ana@ejemplo.com");
    const primero = await confirmarUnPedido();
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await confirmarUnPedido();
    await agregarTarjeta(); // borrador actual: no aparece

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
    expect(archivos[pedido.productos[0].archivoId].nombreOriginal).toBe("tarjeta.jpg");
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
    expect(pedido.total).toBe(confirmado.total);
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
