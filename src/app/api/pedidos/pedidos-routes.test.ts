import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
    uploadsDir: process.env.UPLOADS_DIR,
    productosPath: process.env.PRODUCTOS_PATH,
  };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import type { ProductosArchivo } from "@/lib/catalogo/schema";
import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import { anioEn, formatFolio } from "@/lib/pedidos/pago";
import { PRODUCTOS_PATH } from "@/server/mock-panel";
import { GET as detalle } from "./[id]/route";
import { POST as confirmarRuta } from "./borrador/confirmar/route";
import { POST as agregar } from "./borrador/items/route";
import { GET as getBorrador, PATCH as cambiarCheckout } from "./borrador/route";
import { GET as listar } from "./route";
import { jar } from "@/test/next-headers-mock";
import { GET as descargarArchivo } from "@/app/api/archivos/[id]/route";
import { GET as descargarMiniatura } from "@/app/api/archivos/[id]/miniatura/route";
import { ctxId, fixture, subirArchivoPrueba } from "@/test/archivos";
import { cambiarSesion, iniciarSesionActiva } from "@/test/sesion";

// Folios del año en curso en la zona de la tienda: "KAR-2026-000001".
const ANIO = anioEn(new Date(), ZONA_HORARIA_TIENDA);
const F1 = formatFolio(ANIO, 1);
const F2 = formatFolio(ANIO, 2);

const TARJETA = "6720a1f0c1a2b3c4d5e60201";
const TARJETA_COUCHE = "6720a1f0c1a2b3c4d5e60211";
const SUAJE = 2;

/** Cambia la tarjeta couché en la copia del mock del panel. */
async function editarTarjetaCouche(cambiar: (variante: ProductosArchivo["productos"][0]["variantes"][0]) => void) {
  const archivo: ProductosArchivo = JSON.parse(await readFile(env.productosPath, "utf8"));
  cambiar(archivo.productos.find((p) => p._id === TARJETA)!.variantes.find((v) => v.varianteId === TARJETA_COUCHE)!);
  await writeFile(env.productosPath, JSON.stringify(archivo));
}

/** "Hacer pedido" con la sucursal de entrega ya elegida (obligatoria desde la SPEC 06). */
async function confirmar() {
  await cambiarCheckout(
    new Request("http://localhost/api/pedidos/borrador", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sucursalEntregaId: "6720a1f0c1a2b3c4d5e60100" }),
    }),
  );
  return confirmarRuta();
}

const ordersPath = () => path.join(env.dataDir, "orders.json");
const readOrders = async () => JSON.parse(await readFile(ordersPath(), "utf8"));

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const getDetalle = (id: string) => detalle(new Request("http://localhost"), idCtx(id));

/** Agrega 2 millares de tarjeta couché con suaje ($310.00) con ese frente y reverso. */
async function agregarLinea(frente: string, reverso: unknown = null) {
  const res = await agregar(
    new Request("http://localhost/api/pedidos/borrador/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        archivos: { frente, reverso },
        productoId: TARJETA,
        varianteId: TARJETA_COUCHE,
        especificaciones: [SUAJE],
        cantidad: 2,
      }),
    }),
  );
  expect(res.status).toBe(201);
}

/** Archivos guardados bajo uploads/<carpeta>, con su ruta relativa. */
async function enCarpeta(carpeta: string): Promise<string[]> {
  try {
    const entradas = await readdir(path.join(env.uploadsDir, carpeta), { recursive: true, withFileTypes: true });
    return entradas
      .filter((e) => e.isFile())
      .map((e) => path.relative(path.join(env.uploadsDir, carpeta), path.join(e.parentPath, e.name)))
      .sort();
  } catch {
    return [];
  }
}

/** Sube un archivo y agrega 2 millares de tarjeta couché con suaje ($310.00). */
async function agregarTarjeta() {
  const archivoId = (await subirArchivoPrueba("tarjeta.jpg", "imagen")).id;
  const res = await agregar(
    new Request("http://localhost/api/pedidos/borrador/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        archivos: { frente: archivoId, reverso: null },
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
    expect(await readOrders()).toMatchObject({ contadores: {}, pedidos: [{ estatus: "borrador" }] });
  });

  it("asigna KAR-<año>-000001, pasa a pago_pendiente con los totales del borrador (sin IVA)", async () => {
    await iniciarSesionActiva();
    const pedido = await confirmarUnPedido();
    expect(pedido).toMatchObject({
      folio: F1,
      estatus: "pago_pendiente",
      pagos: [],
      subtotal: 310,
      tasaIva: 0,
      iva: 0,
      total: 310,
    });
    expect(pedido.confirmadoAt).not.toBeNull();
  });

  it("folios consecutivos entre usuarios", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    expect((await confirmarUnPedido()).folio).toBe(F1);
    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await confirmarUnPedido()).folio).toBe(F2);
  });

  it("después de confirmar, GET borrador da uno nuevo vacío", async () => {
    await iniciarSesionActiva();
    const confirmado = await confirmarUnPedido();
    const { pedido } = await (await getBorrador()).json();
    expect(pedido.id).not.toBe(confirmado.id);
    expect(pedido).toMatchObject({ estatus: "borrador", productos: [], folio: null });
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
    expect(await readOrders()).toMatchObject({ contadores: {}, pedidos: [{ estatus: "borrador" }] });
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

describe("archivos al hacer el pedido (SPEC 05)", () => {
  it("copia frente (con miniatura) y reverso a pedidos/<folio>/ y borra los temporales", async () => {
    await iniciarSesionActiva();
    const frente = await subirArchivoPrueba("tarjeta.jpg", await fixture("tarjeta-cmyk.jpg"));
    const reverso = await subirArchivoPrueba("reverso.pdf", "%PDF-1.4");
    await agregarLinea(frente.id, { tipo: "archivo", archivoId: reverso.id });
    expect(await enCarpeta("temporal")).toHaveLength(3);

    const res = await confirmar();
    expect(res.status).toBe(201);
    const { pedido, archivos } = await res.json();
    const { lineaId } = pedido.productos[0];
    const caras = pedido.productos[0].archivos;

    expect(await enCarpeta("pedidos")).toEqual([
      `${F1}/${lineaId}_frente.jpg`,
      `${F1}/${lineaId}_frente.jpg.miniatura.jpg`,
      `${F1}/${lineaId}_reverso.pdf`,
    ]);
    expect(await enCarpeta("temporal")).toEqual([]);

    // Las líneas apuntan a archivos nuevos, con los mismos datos y advertencias.
    expect(caras.frente.archivoId).not.toBe(frente.id);
    expect(caras.reverso.archivoId).not.toBe(reverso.id);
    expect(caras.frente).toMatchObject({ nombreOriginal: "tarjeta.jpg", color: "CMYK", validado: true });
    expect(archivos[caras.frente.archivoId]).toMatchObject({ nombreOriginal: "tarjeta.jpg", estado: "subido", miniatura: true });

    const registros = JSON.parse(await readFile(path.join(env.dataDir, "archivos.json"), "utf8")).archivos;
    expect(registros.map((a: { key: string }) => a.key).sort()).toEqual([
      `pedidos/${F1}/${lineaId}_frente.jpg`,
      `pedidos/${F1}/${lineaId}_reverso.pdf`,
    ]);
  });

  it("el detalle sirve los archivos nuevos (original y miniatura)", async () => {
    await iniciarSesionActiva();
    const contenido = await fixture("tarjeta-cmyk.jpg");
    await agregarLinea((await subirArchivoPrueba("tarjeta.jpg", contenido)).id);
    const { pedido } = await (await confirmar()).json();

    const { archivos } = await (await getDetalle(pedido.id)).json();
    const id = pedido.productos[0].archivos.frente.archivoId;
    expect(Object.keys(archivos)).toEqual([id]);

    const original = await descargarArchivo(new Request(`http://localhost/api/archivos/${id}`), ctxId(id));
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(contenido);
    const miniatura = await descargarMiniatura(new Request(`http://localhost/api/archivos/${id}/miniatura`), ctxId(id));
    expect(miniatura.status).toBe(200);
  });

  it("un mismo archivo en dos líneas queda copiado dos veces", async () => {
    await iniciarSesionActiva();
    const archivo = await subirArchivoPrueba("tarjeta.pdf", "%PDF");
    await agregarLinea(archivo.id);
    await agregarLinea(archivo.id);
    const { pedido } = await (await confirmar()).json();

    const [a, b] = pedido.productos;
    expect(a.archivos.frente.archivoId).not.toBe(b.archivos.frente.archivoId);
    expect(await enCarpeta("pedidos")).toEqual(
      [`${F1}/${a.lineaId}_frente.pdf`, `${F1}/${b.lineaId}_frente.pdf`].sort(),
    );
    expect(await enCarpeta("temporal")).toEqual([]);
  });

  it("calendario y texto no copian nada", async () => {
    await iniciarSesionActiva();
    const anio = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()));
    await agregarLinea((await subirArchivoPrueba("a.pdf", "%PDF")).id, { tipo: "calendario", anio });
    const { pedido } = await (await confirmar()).json();
    expect(pedido.productos[0].archivos.reverso).toEqual({ tipo: "calendario", anio });
    expect(await enCarpeta("pedidos")).toEqual([`${F1}/${pedido.productos[0].lineaId}_frente.pdf`]);
  });

  it("confirmar con advertencias → 201", async () => {
    await iniciarSesionActiva();
    await agregarLinea((await subirArchivoPrueba("rgb.jpg", await fixture("tarjeta-rgb.jpg"))).id);
    const res = await confirmar();
    expect(res.status).toBe(201);
    expect((await res.json()).pedido.productos[0].archivos.frente).toMatchObject({
      validado: false,
      advertencias: [{ codigo: "color" }],
    });
  });

  it("si una línea tiene problema no se copia nada ni se borran los temporales", async () => {
    await iniciarSesionActiva();
    await agregarLinea((await subirArchivoPrueba("a.pdf", "%PDF")).id);
    const archivo: ProductosArchivo = JSON.parse(await readFile(env.productosPath, "utf8"));
    archivo.productos.find((p) => p._id === TARJETA)!.activo = false;
    await writeFile(env.productosPath, JSON.stringify(archivo));

    expect((await confirmar()).status).toBe(409);
    expect(await enCarpeta("pedidos")).toEqual([]);
    expect(await enCarpeta("temporal")).toHaveLength(1);
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
    expect(pedido.folio).toBe(F1);
    expect(archivos[pedido.productos[0].archivos.frente.archivoId].nombreOriginal).toBe("tarjeta.jpg");
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
