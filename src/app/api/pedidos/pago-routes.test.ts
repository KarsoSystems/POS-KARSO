import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y copias del mock del panel antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/pago-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.CONFIGURACION_PATH = `${base}/configuracion.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { base, dataDir: process.env.DATA_DIR, uploadsDir: process.env.UPLOADS_DIR, configuracion: process.env.CONFIGURACION_PATH };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import type { ConfiguracionArchivo } from "@/lib/configuracion/schema";
import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import { anioEn, formatFolio } from "@/lib/pedidos/pago";
import { CONFIGURACION_PATH, PRODUCTOS_PATH } from "@/server/mock-panel";
import { userRepository } from "@/server/repositories";
import { subirArchivoPrueba } from "@/test/archivos";
import { jar } from "@/test/next-headers-mock";
import { iniciarSesionActiva } from "@/test/sesion";
import { POST as pagoRuta } from "./[id]/pago-simulado/route";
import { GET as detalleRuta } from "./[id]/route";
import { POST as confirmarRuta } from "./borrador/confirmar/route";
import { POST as agregarRuta } from "./borrador/items/route";
import { POST as aplicarCodigoRuta } from "./borrador/promociones/route";
import { PATCH as patchRuta } from "./borrador/route";
import { GET as listarRuta } from "./route";

const CENTRO = "6720a1f0c1a2b3c4d5e60100";
const HORA = 60 * 60 * 1000;

const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pagar = (id: string, resultado: string) => pagoRuta(json("POST", { resultado }), ctx(id));
const detalle = async (id: string) => (await (await detalleRuta(new Request("http://localhost"), ctx(id))).json()).pedido;
const lista = async () => (await (await listarRuta()).json()).pedidos;

/** Tarjeta couché × 2 millares con suaje ($310.00), sucursal Centro y "Hacer pedido". */
async function hacerPedido(codigo?: string) {
  const frente = (await subirArchivoPrueba("tarjeta.jpg", "imagen")).id;
  await agregarRuta(
    json("POST", {
      archivos: { frente, reverso: null },
      productoId: "6720a1f0c1a2b3c4d5e60201",
      varianteId: "6720a1f0c1a2b3c4d5e60211",
      especificaciones: [2],
      cantidad: 2,
    }),
  );
  if (codigo) await aplicarCodigoRuta(json("POST", { codigo }));
  await patchRuta(json("PATCH", { sucursalEntregaId: CENTRO }));
  const res = await confirmarRuta();
  expect(res.status).toBe(201);
  return (await res.json()).pedido;
}

/** Mueve el reloj (solo Date) a `fecha`. */
const reloj = (fecha: number | string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(fecha));
};

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, `${env.base}/productos.json`);
  await copyFile(CONFIGURACION_PATH, env.configuracion);
  jar.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("Hacer pedido (SPEC 07)", () => {
  it("folio KAR, pago_pendiente, historial por sistema y 24 h para pagar", async () => {
    await iniciarSesionActiva();
    const pedido = await hacerPedido();
    const anio = anioEn(new Date(), ZONA_HORARIA_TIENDA);
    expect(pedido).toMatchObject({
      folio: formatFolio(anio, 1),
      estatus: "pago_pendiente",
      historialEstatus: [{ estatus: "pago_pendiente", fecha: pedido.confirmadoAt, por: "sistema", comentario: "" }],
      pagos: [],
      pagado: 0,
      saldo: 0,
      cancelacion: null,
    });
    expect(Date.parse(pedido.vencimientoPago) - Date.parse(pedido.confirmadoAt)).toBe(24 * HORA);
    expect((await hacerPedido()).folio).toBe(formatFolio(anio, 2));
  });

  it("los archivos quedan en pedidos/KAR-<año>-000001/", async () => {
    await iniciarSesionActiva();
    const pedido = await hacerPedido();
    const carpeta = await readdir(path.join(env.uploadsDir, "pedidos", pedido.folio));
    expect(carpeta).toEqual([`${pedido.productos[0].lineaId}_frente.jpg`]);
  });

  it("con horasExpiracionPagoPendiente: 1 en el mock, el plazo de los pedidos nuevos es 1 h", async () => {
    await iniciarSesionActiva();
    const antes = await hacerPedido();
    const archivo: ConfiguracionArchivo = JSON.parse(await readFile(env.configuracion, "utf8"));
    archivo.configuracion.pedidos.horasExpiracionPagoPendiente = 1;
    await writeFile(env.configuracion, JSON.stringify(archivo));
    const despues = await hacerPedido();
    expect(Date.parse(despues.vencimientoPago) - Date.parse(despues.confirmadoAt)).toBe(HORA);
    // El ya hecho conserva su plazo.
    expect(Date.parse((await detalle(antes.id)).vencimientoPago) - Date.parse(antes.confirmadoAt)).toBe(24 * HORA);
  });
});

describe("POST /api/pedidos/:id/pago-simulado", () => {
  it("aprobado: enviado, pago por el total, pagado = total, saldo 0 e historial", async () => {
    await iniciarSesionActiva();
    const { id, total } = await hacerPedido();
    const res = await pagar(id, "aprobado");
    expect(res.status).toBe(200);
    const { pedido } = await res.json();
    expect(pedido).toMatchObject({
      estatus: "enviado",
      pagos: [{ tipo: "total", metodo: "mercadopago", monto: total, estatus: "aprobado", recibidoPor: null }],
      pagado: total,
      saldo: 0,
    });
    expect(pedido.pagos[0].referencia).toMatch(/^\d{10}$/);
    expect(pedido.historialEstatus.map((c: { estatus: string; comentario: string }) => [c.estatus, c.comentario])).toEqual([
      ["pago_pendiente", ""],
      ["enviado", "Pago aprobado por Mercado Pago"],
    ]);
  });

  it("rechazado: sigue en pago_pendiente; reintentar y aprobar deja 2 pagos y solo cuenta el aprobado", async () => {
    await iniciarSesionActiva();
    const { id, total } = await hacerPedido();
    const rechazado = (await (await pagar(id, "rechazado")).json()).pedido;
    expect(rechazado).toMatchObject({ estatus: "pago_pendiente", pagado: 0, saldo: total, pagos: [{ estatus: "rechazado" }] });

    const aprobado = (await (await pagar(id, "aprobado")).json()).pedido;
    expect(aprobado.pagos.map((p: { estatus: string }) => p.estatus)).toEqual(["rechazado", "aprobado"]);
    expect(aprobado).toMatchObject({ estatus: "enviado", pagado: total, saldo: 0 });
  });

  it("pendiente: sigue en pago_pendiente con un pago pendiente", async () => {
    await iniciarSesionActiva();
    const { id } = await hacerPedido();
    expect((await (await pagar(id, "pendiente")).json()).pedido).toMatchObject({
      estatus: "pago_pendiente",
      pagado: 0,
      pagos: [{ estatus: "pendiente" }],
    });
  });

  it("un pedido enviado → 409 ESTATUS_INVALIDO; de otro usuario o el borrador → 404; un resultado inválido → 422", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const { id } = await hacerPedido();
    await pagar(id, "aprobado");
    const otraVez = await pagar(id, "aprobado");
    expect(otraVez.status).toBe(409);
    expect((await otraVez.json()).error.code).toBe("ESTATUS_INVALIDO");
    expect((await detalle(id)).pagos).toHaveLength(1);
    expect((await pagar(id, "regalado")).status).toBe(422);

    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await pagar(id, "aprobado")).status).toBe(404);
    expect((await pagar("no-existe", "aprobado")).status).toBe(404);
  });
});

describe("vencimiento del pago (al leer)", () => {
  it("un minuto antes de la hora límite todavía se puede pagar", async () => {
    await iniciarSesionActiva();
    const pedido = await hacerPedido();
    reloj(Date.parse(pedido.vencimientoPago) - 60_000);
    expect((await pagar(pedido.id, "aprobado")).status).toBe(200);
  });

  it("a la hora límite, la lista y el detalle lo muestran cancelado por sistema, y BIENVENIDA5 se libera", async () => {
    const user = await iniciarSesionActiva();
    const pedido = await hacerPedido("BIENVENIDA5");
    expect((await userRepository.findById(user.id))?.usosPromociones).toHaveLength(1);

    reloj(pedido.vencimientoPago);
    const [enLista] = await lista();
    expect(enLista).toMatchObject({
      estatus: "cancelado",
      cancelacion: { fecha: pedido.vencimientoPago, por: "sistema", motivo: "Pago no recibido en 24 h", reembolso: null },
    });
    expect(enLista.historialEstatus.at(-1)).toEqual({
      estatus: "cancelado",
      fecha: pedido.vencimientoPago,
      por: "sistema",
      comentario: "Pago no recibido en 24 h",
    });
    expect((await detalle(pedido.id)).estatus).toBe("cancelado");
    expect((await userRepository.findById(user.id))?.usosPromociones).toEqual([]);
    // Se cancela una sola vez aunque se lea otra vez.
    expect((await detalle(pedido.id)).historialEstatus).toHaveLength(2);
    // Pagarlo después de que el vencimiento lo canceló también es PAGO_VENCIDO.
    const res = await pagar(pedido.id, "aprobado");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("PAGO_VENCIDO");
  });

  it("pagar un pedido vencido → 409 PAGO_VENCIDO y queda cancelado (aunque nadie lo haya leído antes)", async () => {
    const user = await iniciarSesionActiva();
    const pedido = await hacerPedido("BIENVENIDA5");
    reloj(Date.parse(pedido.vencimientoPago) + HORA);
    const res = await pagar(pedido.id, "aprobado");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "PAGO_VENCIDO", message: "El plazo para pagar este pedido venció" });
    const guardado = JSON.parse(await readFile(path.join(env.dataDir, "orders.json"), "utf8")).pedidos.find(
      (p: { id: string }) => p.id === pedido.id,
    );
    expect(guardado).toMatchObject({ estatus: "cancelado", pagos: [] });
    expect((await userRepository.findById(user.id))?.usosPromociones).toEqual([]);
  });

  it("un pedido enviado no vence", async () => {
    await iniciarSesionActiva();
    const pedido = await hacerPedido();
    await pagar(pedido.id, "aprobado");
    reloj(Date.parse(pedido.vencimientoPago) + 48 * HORA);
    expect((await detalle(pedido.id)).estatus).toBe("enviado");
  });
});
